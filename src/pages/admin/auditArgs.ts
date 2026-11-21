/** The arguments of a call with indentation for the details of an audit row: the
 * stored summary is JSON when the tool takes an object (FTR.NAB.CMN-0001 R28). */
export function prettyArgs(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
