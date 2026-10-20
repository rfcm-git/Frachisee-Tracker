import { PAGE_OPTIONS } from "../config/constants.js";
import { setPage, setPageSize, useUiStore } from "../state/uiStore.js";

/**
 * Pages a list with the page and page size kept in the UI store.
 * which: "fr" | "frst" | "st" | "is" | "ob" | "cl"
 * Returns { items, pagerProps } where pagerProps go straight to <Pagination>.
 */
export function usePaged(which, list) {
  const storedPage = useUiStore((state) => state.pages[which]);
  const pageSize = useUiStore((state) => state.pageSizes[which]);
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(Math.max(1, storedPage), pageCount);
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    pagerProps: {
      page, pageSize, pageCount, count: list.length, pageOptions: PAGE_OPTIONS[which],
      onPage: (value) => setPage(which, value),
      onPageSize: (value) => setPageSize(which, value),
    },
  };
}
