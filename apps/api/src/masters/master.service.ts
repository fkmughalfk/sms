import { Injectable } from '@nestjs/common';
import type { AuthUser, MasterListQuery, MasterOption, Paginated } from '@sms/shared';
import { AuditService } from '../audit/audit.service';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  activeIs,
  assertUnique,
  listArgs,
  nameContains,
  notId,
  orNotFound,
  toPage,
} from './master-utils';

/** The subset of a Prisma model delegate the master services use. */
export interface MasterDelegate<Rec> {
  findMany(args: object): Promise<Rec[]>;
  count(args: object): Promise<number>;
  findUnique(args: object): Promise<Rec | null>;
  findFirst(args: object): Promise<{ id: string } | null>;
  create(args: object): Promise<Rec>;
  update(args: object): Promise<Rec>;
}

export type Db = PrismaService | Prisma.TransactionClient;

type Writable<Create> = Partial<Create> & { isActive?: boolean };

/**
 * CRUD for one master table (spec §5.6, §7): paginated search, active-only options,
 * case-insensitive unique names, `isActive` instead of delete, and every write in a
 * transaction with an audit entry (CLAUDE.md rules 6–8).
 *
 * `Rec` is the raw Prisma record (from `select`), `Row` the API response.
 */
@Injectable()
export abstract class MasterService<
  Rec extends { id: string; name: string; isActive: boolean },
  Row,
  Create extends { name: string },
  Query extends MasterListQuery = MasterListQuery,
> {
  /** Audit entity, e.g. "City". */
  protected abstract readonly entity: string;
  /** Lower-case noun for messages, e.g. "city". */
  protected abstract readonly label: string;
  protected abstract readonly select: object;
  protected abstract delegate(db: Db): MasterDelegate<Rec>;

  protected readonly sortable: readonly string[] = ['name'];

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly audit: AuditService,
  ) {}

  // ── Hooks ──

  /** Raw record → response row (e.g. Decimal → string). `ctx` comes from `loadContext`. */
  protected toRow(rec: Rec, _ctx: unknown): Row {
    return rec as unknown as Row;
  }

  /** Data `toRow` needs, loaded once per operation (e.g. the settings default rate). */
  protected loadContext(_db: Db): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  /** Extra list filters beyond search/active. */
  protected listWhere(query: Query): object {
    return nameContains(query.search);
  }

  /** Where-clause that would clash with `name` (override for scoped uniqueness). */
  protected uniqueNameWhere(name: string, _merged: Writable<Create>): object {
    return { name };
  }

  /** Validate references / other unique fields before a write. `existing` is set on update. */
  protected async beforeWrite(_db: Db, _input: Writable<Create>, _existing?: Rec): Promise<void> {}

  /** Prisma `data` for a write (override to map fields). */
  protected toData(input: Writable<Create>): object {
    return input;
  }

  // ── Operations ──

  async list(query: Query): Promise<Paginated<Row>> {
    const where = { ...this.listWhere(query), ...activeIs(query.active) };
    const [rows, total, ctx] = await Promise.all([
      this.delegate(this.prisma).findMany({
        where,
        select: this.select,
        ...listArgs(query, this.sortable),
      }),
      this.delegate(this.prisma).count({ where }),
      this.loadContext(this.prisma),
    ]);
    return toPage(
      rows.map((r) => this.toRow(r, ctx)),
      total,
      query,
    );
  }

  async options(): Promise<MasterOption[]> {
    const rows = await this.delegate(this.prisma).findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ id, name }) => ({ id, name }));
  }

  async get(id: string): Promise<Row> {
    const [rec, ctx] = await Promise.all([
      this.findOrThrow(this.prisma, id),
      this.loadContext(this.prisma),
    ]);
    return this.toRow(rec, ctx);
  }

  create(actor: AuthUser, input: Create, ip: string | null): Promise<Row> {
    return this.prisma.$transaction(async (tx) => {
      await this.assertNameFree(tx, input.name, input);
      await this.beforeWrite(tx, input);
      const row = this.toRow(
        await this.delegate(tx).create({ data: this.toData(input), select: this.select }),
        await this.loadContext(tx),
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: this.entity,
          entityId: (row as { id: string }).id,
          after: row,
          ip,
        },
        tx,
      );
      return row;
    });
  }

  update(actor: AuthUser, id: string, input: Writable<Create>, ip: string | null): Promise<Row> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findOrThrow(tx, id);
      const merged = { ...existing, ...input } as unknown as Writable<Create>;
      if (input.name !== undefined || this.nameScopeChanged(input)) {
        await this.assertNameFree(tx, (merged as { name: string }).name, merged, id);
      }
      await this.beforeWrite(tx, input, existing);
      const ctx = await this.loadContext(tx);
      const row = this.toRow(
        await this.delegate(tx).update({
          where: { id },
          data: this.toData(input),
          select: this.select,
        }),
        ctx,
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: this.entity,
          entityId: id,
          before: this.toRow(existing, ctx),
          after: row,
          ip,
        },
        tx,
      );
      return row;
    });
  }

  setStatus(actor: AuthUser, id: string, isActive: boolean, ip: string | null): Promise<Row> {
    return this.update(actor, id, { isActive } as Writable<Create>, ip);
  }

  /** Whether a change other than `name` affects name uniqueness (e.g. sub-party's parent). */
  protected nameScopeChanged(_input: Writable<Create>): boolean {
    return false;
  }

  protected async findOrThrow(db: Db, id: string): Promise<Rec> {
    const title = this.label.charAt(0).toUpperCase() + this.label.slice(1);
    return orNotFound(
      await this.delegate(db).findUnique({ where: { id }, select: this.select }),
      title,
    );
  }

  private async assertNameFree(db: Db, name: string, merged: Writable<Create>, id?: string) {
    const clash = await this.delegate(db).findFirst({
      where: { ...this.uniqueNameWhere(name, merged), ...notId(id) },
      select: { id: true },
    });
    assertUnique(clash, `A ${this.label} named “${name}” already exists.`);
  }
}
