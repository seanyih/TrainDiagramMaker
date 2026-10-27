## Track Layout

### Types

| svg       | 線路數量 | 交會  | 順行追越 | 逆行追越 | 同時順行追越、交會 | 同時逆行追越、交會 | 同時雙向皆追越、交會 |
| --------- | ---- | --- | ---- | ---- | --------- | --------- | ---------- |
| single    | 1    | X   | X    | X    | X         | X         | X          |
| double.0  | 2    | V   | X    | X    | X         | X         | X          |
| double.1  | 2    | V   | V    | X    | X         | X         | X          |
| double.2  | 2    | V   | X    | V    | X         | X         | X          |
| double.3  | 2    | V   | V    | V    | X         | X         | X          |
| triple.1  | 3    | V   | V    | X    | V         | X         | X          |
| triple.2  | 3    | V   | X    | V    | X         | V         | X          |
| triple.3  | 3    | V   | V    | V    | V         | V         | X          |
| quadruple | 4    | V   | V    | V    | V         | V         | V          |

### Transitions

| from\to   | single | double.0 | double.1 | double.2 | double.3 | triple.1 | triple.2 | triple.3 | quadruple |
| --------- | ------ | -------- | -------- | -------- | -------- | -------- | -------- | -------- | --------- |
| single    | 1-1    | 1-2      | 1-2      | 1-2      | 1-2      | 1-3R     | 1-3L     | 1-3L     | 1-4       |
| double.0  |        | 2-2      | 2-2-1    | 2-2-2    | 2-2-3    | 2-3R     | 2-3L     | 2-3L-1   | 2-4       |
| double.1  |        |          | 2-2      | 2-2-2    | 2-2-2    | 2-3R-2   | 2-3L-2   | 2-3L-1   | 2-4-2     |
| double.2  |        |          |          | 2-2      | 2-2-1    | 2-3R-1   | 2-3L-1   | 2-3L-1   | 2-4-1     |
| double.3  |        |          |          |          | 2-2      | 2-3R-3   | 2-3L-3   | 2-3L-3   | 2-4-3     |
| triple.1  |        |          |          |          |          | 3R-3R    | 3R-3L    | 3R-3L-1  | 3R-4      |
| triple.2  |        |          |          |          |          |          | 3L-3L    | 3L-3L-1  | 3L-4      |
| triple.3  |        |          |          |          |          |          |          | 3L-3L    | 3L-4-2    |
| quadruple |        |          |          |          |          |          |          |          | 4-4       |
