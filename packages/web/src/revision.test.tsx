import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { BuildStamp, revisionLabel } from "./revision.js";

describe("build stamp", () => {
  test("shows the first seven characters of a commit", () => {
    expect(revisionLabel("267814518a3e14b252df3be408f36f3d88c1464b")).toBe(
      "2678145",
    );
    expect(revisionLabel("dev")).toBe("dev");
    expect(revisionLabel("  ")).toBe("dev");
  });

  test("puts the full commit in the tooltip", () => {
    const markup = renderToStaticMarkup(
      <BuildStamp revision="267814518a3e14b252df3be408f36f3d88c1464b" />,
    );

    expect(markup).toContain("версия 2678145");
    expect(markup).toContain(
      'title="версия 267814518a3e14b252df3be408f36f3d88c1464b"',
    );
  });
});
