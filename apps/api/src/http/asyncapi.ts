import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Express } from "express";
import { asyncApiDocument } from "../asyncapi/document";

const require = createRequire(import.meta.url);
const componentRoot = dirname(require.resolve("@asyncapi/react-component/package.json"));

const page = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Знакомства AsyncAPI</title>
    <link rel="stylesheet" href="default.min.css" />
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      }
    </style>
  </head>
  <body>
    <div id="asyncapi"></div>
    <script src="standalone.js"></script>
    <script>
      AsyncApiStandalone.render(
        {
          schema: { url: "/asyncapi.json" },
          config: { show: { sidebar: true } },
        },
        document.getElementById("asyncapi"),
      );
    </script>
  </body>
</html>
`;

export function mountAsyncApi(app: Express) {
  app.get("/asyncapi.json", (_req, res) => {
    res.json(asyncApiDocument);
  });

  app.use("/asyncapi", (req, res, next) => {
    if (req.originalUrl.split("?")[0] === "/asyncapi") {
      res.redirect(308, "/asyncapi/");

      return;
    }

    next();
  });

  app.get("/asyncapi", (_req, res) => {
    res.type("html").send(page);
  });

  app.get("/asyncapi/standalone.js", (_req, res) => {
    res.sendFile(join(componentRoot, "browser/standalone/index.js"));
  });

  app.get("/asyncapi/default.min.css", (_req, res) => {
    res.sendFile(join(componentRoot, "styles/default.min.css"));
  });
}
