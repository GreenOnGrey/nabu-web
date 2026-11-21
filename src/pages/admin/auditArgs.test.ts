import { describe, expect, it } from "vitest";
import { prettyArgs } from "./auditArgs";

// FTR.NAB.CMN-0001 AUD-08: the details of an audit row show the arguments as JSON
// with indentation, and the copy button copies exactly what is shown.
describe("FTR.NAB.CMN-0001 AUD-08", () => {
  it("arguments are shown as JSON with indentation", () => {
    expect(prettyArgs('{"path":"reports/q1.pdf","pages":[1,2]}')).toBe('{\n  "path": "reports/q1.pdf",\n  "pages": [\n    1,\n    2\n  ]\n}');
  });

  it("a summary that is not JSON stays as it is", () => {
    expect(prettyArgs("go test ./...")).toBe("go test ./...");
  });
});
