import { Fragment, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { editorValue, richHtml } from "../../lib/richText.js";

const COMMANDS = [
  { command: "bold", icon: "bold", title: "Bold (Ctrl+B)", label: "Bold" },
  { command: "insertUnorderedList", icon: "list", title: "Bulleted list", label: "Bulleted list" },
  { command: "outdent", icon: "indent-decrease", title: "Decrease indent (Shift+Tab)", label: "Decrease indent" },
  { command: "indent", icon: "indent-increase", title: "Increase indent (Tab)", label: "Increase indent" },
];

/**
 * Small rich-text editor (bold, bullets, indent).
 * Read the value through the ref: ref.current.getValue() returns the cleaned value to save.
 * onInput is called on every change (used to mark a form as edited).
 */
export default function RichTextEditor({ ref, initialValue = "", placeholder = "", minHeight, autoFocus = false, onInput, id }) {
  const editorRef = useRef(null);
  const [active, setActive] = useState({});

  useImperativeHandle(ref, () => ({
    getValue: () => editorValue(editorRef.current?.innerHTML || ""),
    clear: () => { if (editorRef.current) editorRef.current.innerHTML = ""; },
    focus: () => editorRef.current?.focus(),
  }), []);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialValue ? richHtml(initialValue) : "";
    if (autoFocus) setTimeout(() => editorRef.current?.focus(), 60);
    // initialValue is only applied when the editor mounts
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshToolbar = useCallback(() => {
    const editor = editorRef.current;
    const selection = document.getSelection();
    const inside = !!(editor && selection?.anchorNode && editor.contains(selection.anchorNode));
    const next = {};
    COMMANDS.forEach(({ command }) => {
      try { next[command] = inside && document.queryCommandState(command); } catch { next[command] = false; }
    });
    setActive(next);
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refreshToolbar);
    return () => document.removeEventListener("selectionchange", refreshToolbar);
  }, [refreshToolbar]);

  function applyCommand(event, command) {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const selection = document.getSelection();
    if (!selection?.anchorNode || !editor.contains(selection.anchorNode)) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.execCommand(command, false, null);
    refreshToolbar();
    onInput?.();
  }

  function handleKeyDown(event) {
    if (event.key !== "Tab") return;
    event.preventDefault();
    document.execCommand(event.shiftKey ? "outdent" : "indent", false, null);
    refreshToolbar();
  }

  function handlePaste(event) {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
    refreshToolbar();
  }

  return <div className="rte">
    <div className="rte-bar" role="toolbar" aria-label="Text formatting">
      {COMMANDS.map((item, index) => <Fragment key={item.command}>
        {index === 1 && <span className="rte-sep" />}
        <button type="button" className={active[item.command] ? "on" : ""} title={item.title} aria-label={item.label}
          onMouseDown={(event) => applyCommand(event, item.command)}
          onClick={(event) => { if (event.detail === 0) applyCommand(event, item.command); }}><Icon name={item.icon} /></button>
      </Fragment>)}
    </div>
    <div className="rte-ed" id={id} ref={editorRef} contentEditable role="textbox" aria-multiline="true"
      data-placeholder={placeholder} style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      suppressContentEditableWarning onKeyDown={handleKeyDown} onPaste={handlePaste} onKeyUp={refreshToolbar} onMouseUp={refreshToolbar}
      onInput={onInput} />
  </div>;
}
