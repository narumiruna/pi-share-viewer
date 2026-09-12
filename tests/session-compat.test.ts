/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  prepareSessionCompatibility,
  SESSION_COMPAT_SIGNATURES,
} from "../src/session-compat.js";

const template = readFileSync(
  "node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/template.js",
  "utf8",
);

function fixture(source = template): Document {
  return new DOMParser().parseFromString(
    `<html><head></head><body><script id="session-data" type="application/json">e30=</script><script>/* marked v18.0.5 */</script><script>/* hljs */</script><script>${source}</script></body></html>`,
    "text/html",
  );
}

describe("Pi 0.85.0 session compatibility seam", () => {
  test("records and guards filtering, header, cloning, tool-target and Escape signatures", () => {
    for (const signature of Object.values(SESSION_COMPAT_SIGNATURES)) {
      expect(template.split(signature)).toHaveLength(2);
    }
  });

  test("installs each lifecycle hook once without changing cached clone or tool mapping", () => {
    const root = fixture();
    const application = prepareSessionCompatibility(root);
    const source = application?.textContent ?? "";

    expect(application).toBeDefined();
    expect(source).toContain(
      "if (isCurrentLeaf && searchTokens.length === 0) return true;",
    );
    expect(source).toContain(SESSION_COMPAT_SIGNATURES.cachedMessageClone);
    expect(source).toContain(SESSION_COMPAT_SIGNATURES.toolTargetMapping);
    expect(source).toContain(
      "(globalThis.__PI_SESSION_COPY__ || copyToClipboard)(shareUrl, btn);",
    );
    expect(source.match(/pi-session-header-render/g)).toHaveLength(1);
    expect(source.match(/pi-session-tree-render/g)).toHaveLength(1);
    expect(source.match(/pi-session-render'/g)).toHaveLength(1);
    expect(source.match(/pi-session-escape/g)).toHaveLength(1);
  });

  test.each(Object.keys(SESSION_COMPAT_SIGNATURES))(
    "leaves the export untouched when the %s signature changes",
    (key) => {
      const signature =
        SESSION_COMPAT_SIGNATURES[
          key as keyof typeof SESSION_COMPAT_SIGNATURES
        ];
      const changed = signature.replace(/[A-Za-z]/, (value) =>
        value === value.toUpperCase()
          ? value.toLowerCase()
          : value.toUpperCase(),
      );
      const root = fixture(template.replace(signature, changed));
      const before = root.documentElement.outerHTML;
      expect(prepareSessionCompatibility(root)).toBeUndefined();
      expect(root.documentElement.outerHTML).toBe(before);
    },
  );

  test.each(Object.keys(SESSION_COMPAT_SIGNATURES))(
    "leaves the export untouched when the %s signature is duplicated",
    (key) => {
      const signature =
        SESSION_COMPAT_SIGNATURES[
          key as keyof typeof SESSION_COMPAT_SIGNATURES
        ];
      const root = fixture(`${template}\n${signature}`);
      const before = root.documentElement.outerHTML;
      expect(prepareSessionCompatibility(root)).toBeUndefined();
      expect(root.documentElement.outerHTML).toBe(before);
    },
  );

  test("leaves duplicate or externally sourced applications untouched", () => {
    const duplicate = fixture();
    duplicate.body.append(
      duplicate.body.lastElementChild?.cloneNode(true) ?? "",
    );
    const beforeDuplicate = duplicate.documentElement.outerHTML;
    expect(prepareSessionCompatibility(duplicate)).toBeUndefined();
    expect(duplicate.documentElement.outerHTML).toBe(beforeDuplicate);

    const external = fixture();
    (external.body.lastElementChild as HTMLScriptElement).src =
      "https://example.com/app.js";
    const beforeExternal = external.documentElement.outerHTML;
    expect(prepareSessionCompatibility(external)).toBeUndefined();
    expect(external.documentElement.outerHTML).toBe(beforeExternal);
  });
});
