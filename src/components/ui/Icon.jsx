import { ICONS } from "./iconRegistry.js";

/**
 * Lucide icon by name, e.g. <Icon name="store" />.
 * The data-lucide attribute is kept because the stylesheets size icons with it.
 * Unknown names (for example from saved link sections) fall back to a folder icon.
 */
export default function Icon({ name, className, style }) {
  const Svg = ICONS[name] || ICONS.folder;
  return <Svg data-lucide={name} className={className} style={style} aria-hidden="true" focusable="false" />;
}
