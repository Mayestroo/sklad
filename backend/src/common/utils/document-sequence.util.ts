/**
 * Standard document sequence generator for Sklad ERP documents
 * Generates formatted document numbers like: PREFIX-YYYY-0001
 */

export async function generateDocumentSequence(
  prefixTag: string,
  countQuery: (prefix: string) => Promise<number>,
  padLength: number = 4,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${prefixTag}-${year}-`;
  const count = await countQuery(prefix);
  const nextNum = (count + 1).toString().padStart(padLength, '0');
  return `${prefix}${nextNum}`;
}
