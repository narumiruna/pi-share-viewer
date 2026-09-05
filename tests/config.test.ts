import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("repository shape", () => {
  test("is a private, flat Web app without a Pi extension", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      name?: string;
      private?: boolean;
      pi?: unknown;
      dependencies?: Record<string, string>;
      engines?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };

    expect(packageJson.name).toBe("@narumiruna/pi-share-viewer");
    expect(packageJson.private).toBe(true);
    expect(packageJson.engines?.node).toBe(">=22.22.2");
    expect(packageJson.pi).toBeUndefined();
    expect(
      packageJson.peerDependencies?.["@earendil-works/pi-coding-agent"],
    ).toBeUndefined();
    expect(existsSync("web")).toBe(false);
    expect(existsSync("src/extension")).toBe(false);
    expect(packageJson.dependencies).toMatchObject({
      "@radix-ui/colors": expect.any(String),
      "@radix-ui/react-icons": expect.any(String),
      "@radix-ui/react-toggle": expect.any(String),
      "@radix-ui/react-toolbar": expect.any(String),
      "@radix-ui/react-tooltip": expect.any(String),
      marked: expect.any(String),
      react: expect.any(String),
      "react-dom": expect.any(String),
    });
  });

  test("builds isolated browser-only Mermaid runtimes", () => {
    const enhancerConfig = readFileSync("vite.enhancer.config.ts", "utf8");
    const rendererConfig = readFileSync("vite.renderer.config.ts", "utf8");

    expect(enhancerConfig).toContain('"process.env.NODE_ENV"');
    expect(enhancerConfig).toContain('JSON.stringify("production")');
    expect(rendererConfig).toContain("src/mermaid-renderer.ts");
    expect(rendererConfig).toContain('fileName: () => "mermaid-renderer.js"');
  });

  test("keeps container execution out of CI", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow.split("\n")).not.toContain("  container:");
    expect(workflow).not.toContain("docker compose");
  });

  test("pins a non-root container and hardened Compose service", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    const compose = readFileSync("compose.yaml", "utf8");
    const dockerignore = readFileSync(".dockerignore", "utf8");
    const nginx = readFileSync("nginx.conf", "utf8");
    const sessionPage = readFileSync("session/index.html", "utf8");

    expect(dockerfile).toMatch(/^FROM node:\d+\.\d+\.\d+-alpine\d+\.\d+/m);
    expect(dockerfile).toMatch(
      /^FROM nginxinc\/nginx-unprivileged:\d+\.\d+\.\d+-alpine\d+\.\d+/m,
    );
    expect(dockerfile).toContain("USER 101:101");
    expect(compose).toContain("name: pi-share-viewer");
    expect(compose).toMatch(/ports:\s+- "\$\{PORT:-18080\}:80"/);
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("cap_drop:\n      - ALL");
    expect(dockerignore).toContain(".pi\n");
    expect(dockerignore).toContain("tests\n");
    expect(dockerfile).toContain("vite.renderer.config.ts");
    expect(nginx).toContain('default "no-store"');
    expect(nginx).toContain('"public, max-age=31536000, immutable"');
    expect(nginx).toContain("location = /healthz");
    expect(sessionPage).toContain('sandbox="allow-scripts allow-downloads"');
    expect(sessionPage).not.toContain("allow-same-origin");
  });
});
