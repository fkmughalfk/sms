# Sales Invoice — Print Format

Reference layout taken from a printed Waqar Rice Mills sales invoice (A4 portrait, 2 pages).
Only the **layout** is recorded here. Values, party, company and products in the sample are placeholders.

## 1. Letterhead (top, every page 1)

- Logo top-left.
- Company name centred, large, bold, dark red.
- Address and phone line centred under it, bold, small.
- Title **SALES INVOICE** centred, bold, below the address.

## 2. Header blocks (two columns, side by side)

Each block has a title on a black bar with white bold text. Each field is a label followed by a value on an underline.

**Left: "Customer 's Detail"**

| Field        |
| ------------ |
| Name         |
| Sub Party    |
| Address      |
| City         |
| Contact      |
| G.S.T NUMBER |

**Right: "Invoice Detail"** (values are centred on the line)

| Field                       |
| --------------------------- |
| Invoice No.                 |
| Invoice Date (`DD/MM/YYYY`) |
| D.o.No.                     |
| Vehicle No                  |
| DC No                       |
| Ntn/Cnic                    |
| OGP No.                     |
| Booking No.                 |

## 3. Line-items table (full width, bordered grid)

| Column      | Align                  | Format                                                    |
| ----------- | ---------------------- | --------------------------------------------------------- |
| Sr. No.     | centre                 | 1, 2, 3…                                                  |
| Description | left, wraps to 2 lines | product name                                              |
| CropYear    | centre                 | `YYYY-YYYY`                                               |
| Qty         | right                  | integer (bags)                                            |
| Rate 40Kg   | right                  | thousands separator, no decimals                          |
| Bag Rate    | right                  | 2 decimals, no separator (= Rate 40Kg ÷ 40 × pack weight) |
| Weight      | right                  | kg (= Qty × pack weight)                                  |
| AMOUNT      | right                  | thousands separator, no decimals                          |

Headers are bold and centred. One blank row closes the table on the last items page.

## 4. Totals area (bottom of every page)

- **Total** row: label "Total" in the left part. Qty total sits under Qty, Weight total under Weight and Amount total under AMOUNT.
- Right-hand stack of label/value rows under the Amount columns, labels right-aligned in bold serif:
  1. Add Expenses
  2. Less Expenses
  3. **Value** (bold) = Total + Add Expenses − Less Expenses
  4. Less-Freight
  5. (empty space)
  6. **Net payable**: whole row has a light-green fill, bold = Value − Less-Freight
- Bottom-left: boxed **Note**, italic: _"any issue and ambiguity in the aforesaid invoice are accepted within 7 days after issuing the invoice."_
- Full-width row: **Rupees :** followed by the amount in words, e.g. `Rupees (two hundred twenty-one thousand three hundred eleven) / Only.`

## 5. Signatures (bottom of every page)

Three columns, each a name above a line with a bold caption below: **Prepared By** (left), **Verified By** (centre), **Approved By** (right).

## 6. Multi-page behaviour

- Page 1 holds the letterhead, the header blocks and as many lines as fit.
- Later pages continue the line table with no letterhead or headers repeated.
- The totals area, the note, the amount in words and the signatures repeat at the bottom of **every** page, always showing the grand totals.

## 7. Line rounding

A half rupee rounds **down** (owner's decision, 2026-11-05): 12,812.5 → 12,812 and 10,312.5 → 10,312. Anything above half rounds up. This is the system-wide rule (CLAUDE.md rule 3), so the printout shows the stored amounts unchanged.
