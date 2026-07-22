type CsvRows = readonly Readonly<Record<string, string>>[];

const parsedCsvHeaders = new WeakMap<object, readonly string[]>();

export function parseCsv(text: string): CsvRows {
  const rows = parseRows(text.startsWith("\uFEFF") ? text.slice(1) : text);
  if (rows.length === 0) throw new TypeError("CSV must include a header row");

  while (rows.length > 1 && rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") {
    rows.pop();
  }

  const headers = rows[0].map((header) => header.trim());
  if (headers.length === 0) throw new TypeError("CSV must include a header row");
  for (const header of headers) {
    if (header === "") throw new TypeError("CSV contains a blank header");
  }
  if (new Set(headers).size !== headers.length) {
    throw new TypeError("CSV contains a duplicate header");
  }

  const parsedRows = rows.slice(1).map((row, rowIndex) => {
    if (row.length !== headers.length) {
      throw new TypeError(`CSV row ${rowIndex + 2} has inconsistent column count`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
  });
  parsedCsvHeaders.set(parsedRows, [...headers]);
  return parsedRows;
}

export function getParsedCsvHeaders(rows: CsvRows): readonly string[] | undefined {
  const headers = parsedCsvHeaders.get(rows);
  return headers && [...headers];
}

function parseRows(text: string): string[][] {
  if (text === "") return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inQuotes) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === "\"") {
      if (field !== "" || closedQuote) throw new TypeError("CSV has an invalid quote");
      inQuotes = true;
      continue;
    }
    if (closedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new TypeError("CSV has an invalid quote");
    }
    if (character === ",") {
      row.push(field);
      field = "";
      closedQuote = false;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      closedQuote = false;
      continue;
    }
    field += character;
  }

  if (inQuotes) throw new TypeError("CSV has an unclosed quote");
  if (field !== "" || row.length > 0 || closedQuote) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
