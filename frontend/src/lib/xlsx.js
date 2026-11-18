/* Loads the Excel library only when it is first needed (it is large). */
let loading = null;

export function loadXlsx() {
  if (!loading) {
    loading = import("xlsx-js-style").then((module) => {
      const XLSX = module.utils ? module : module.default;
      if (!XLSX?.utils) throw new Error("Excel tool didn't load");
      return XLSX;
    }).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
