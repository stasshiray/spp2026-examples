import type { Response } from "express";
import { stringify } from "yaml";

export function sendYaml(res: Response, document: unknown) {
  res.type("application/yaml").send(stringify(document));
}
