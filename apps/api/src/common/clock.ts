import { Injectable } from '@nestjs/common';
import { businessToday } from '@sms/shared';

/** "Today" in Asia/Karachi (CLAUDE.md rule 9). A provider so tests can pin the date. */
@Injectable()
export class Clock {
  today(): string {
    return businessToday();
  }
}
