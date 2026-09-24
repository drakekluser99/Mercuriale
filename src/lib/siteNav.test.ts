import { describe, expect, it } from "vitest";
import { sectionForPath } from "./siteNav";

describe("sectionForPath", () => {
  it("riconosce la pagina di sezione e le sue sotto-pagine", () => {
    expect(sectionForPath("/europa")).toBe("/europa");
    expect(sectionForPath("/italia/qualcosa")).toBe("/italia");
  });

  it("porta le pagine di dettaglio alla loro sezione", () => {
    expect(sectionForPath("/paese/italia")).toBe("/europa");
    expect(sectionForPath("/provincia/milano")).toBe("/italia");
  });

  it("non confonde un prefisso con una sezione", () => {
    // "/italiana" comincia con "/italia" ma non è una sua sotto-pagina.
    expect(sectionForPath("/italiana")).toBeNull();
    expect(sectionForPath("/paese")).toBeNull();
  });

  it("home e pagine secondarie non hanno sezione", () => {
    expect(sectionForPath("/")).toBeNull();
    expect(sectionForPath("/metodologia")).toBeNull();
  });
});
