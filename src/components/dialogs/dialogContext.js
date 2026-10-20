import { createContext, useContext } from "react";

/** Given to every open dialog by DialogHost: { id, isTop, zIndex, close, setBusy } */
export const DialogContext = createContext({ id: "", isTop: true, zIndex: 60, close: () => {}, setBusy: () => {} });

export const useDialog = () => useContext(DialogContext);
