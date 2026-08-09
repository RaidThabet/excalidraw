import clsx from "clsx";
import { useEffect, useMemo, useState, type JSX } from "react";

import {
  CaptureUpdateAction,
  newElementWith,
  getBoundTextElement,
  redrawTextBoundingBox,
  getShapeIcon,
  getIconSize,
  getIconTextAlignment,
  isContainerLayout,
  isIconableElement,
  preloadIconImage,
  DEFAULT_SHAPE_ICON_PLACEMENT,
  MAX_ICON_SIZE,
  MIN_ICON_SIZE,
  SHAPE_ICON_PLACEMENTS,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ShapeIconData,
  ShapeIconPalette,
  ShapeIconPlacement,
} from "@excalidraw/element/types";

import { CheckboxItem } from "../components/CheckboxItem";
import { FilledButton } from "../components/FilledButton";
import { RadioSelection } from "../components/RadioSelection";
import {
  LoadIcon,
  TrashIcon,
  ShapeIconCenterIcon,
  ShapeIconTopLeftIcon,
  ShapeIconTopRightIcon,
  ShapeIconBottomLeftIcon,
  ShapeIconBottomRightIcon,
} from "../components/icons";
import {
  collectDroppedSvgs,
  groupIconsByCategory,
  importIcons,
  listLibraryIcons,
} from "../data/iconLibrary";
import { sanitizeSvg, extractPalette, svgToDataUrl } from "../data/svgIcon";

import { register } from "./register";

import "./ShapeIcon.scss";

import type { LibraryIcon } from "../data/iconLibrary";

const PLACEMENT_ICONS: Record<ShapeIconPlacement, JSX.Element> = {
  center: ShapeIconCenterIcon,
  "top-left": ShapeIconTopLeftIcon,
  "top-right": ShapeIconTopRightIcon,
  "bottom-left": ShapeIconBottomLeftIcon,
  "bottom-right": ShapeIconBottomRightIcon,
};

const PLACEMENT_LABELS: Record<ShapeIconPlacement, string> = {
  center: "Center",
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};

type IconActionValue =
  | { kind: "set"; svg: string; palette: ShapeIconPalette }
  | { kind: "placement"; placement: ShapeIconPlacement }
  | { kind: "container"; isContainer: boolean }
  | { kind: "size"; size: number | undefined }
  | { kind: "remove" };

export const actionSetShapeIcon = register<IconActionValue>({
  name: "setShapeIcon",
  label: "Shape icon",
  trackEvent: false,
  perform: (elements, appState, value, app) => {
    const selected = app.scene
      .getSelectedElements(appState)
      .filter((el: ExcalidrawElement) => isIconableElement(el));
    if (!value || selected.length !== 1) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }
    const target = selected[0];
    const selectedId = target.id;
    const prevIcon = getShapeIcon(target);

    let nextIcon: ShapeIconData | undefined;
    switch (value.kind) {
      case "remove":
        nextIcon = undefined;
        break;
      case "set":
        nextIcon = {
          svg: value.svg,
          placement: prevIcon?.placement ?? DEFAULT_SHAPE_ICON_PLACEMENT,
          palette: value.palette,
          isContainer: prevIcon ? isContainerLayout(prevIcon) : true,
          size: prevIcon?.size,
        };
        break;
      case "placement":
        nextIcon = prevIcon
          ? { ...prevIcon, placement: value.placement }
          : undefined;
        break;
      case "container":
        nextIcon = prevIcon
          ? { ...prevIcon, isContainer: value.isContainer }
          : undefined;
        break;
      case "size":
        nextIcon = prevIcon ? { ...prevIcon, size: value.size } : undefined;
        break;
    }

    const boundText = getBoundTextElement(
      target,
      app.scene.getNonDeletedElementsMap(),
    );

    const containerPatch: Record<string, any> = {
      customData: { ...target.customData, icon: nextIcon },
    };
    if (value.kind === "set") {
      containerPatch.backgroundColor = value.palette.background;
      containerPatch.strokeColor = value.palette.stroke;
    }
    // The text's layout depends on the icon's placement (getIconTextInset
    // reserves the icon's room), so the container must already carry the NEW
    // icon before we re-lay-out the text against it.
    const nextContainer = newElementWith(target, containerPatch);

    const nextElements = elements.map((el) => {
      if (el.id === selectedId) {
        return nextContainer;
      }
      if (boundText && el.id === boundText.id) {
        // derived from the UPDATED container: container shapes align the text
        // to the icon's edge, everything else keeps it centered
        const { textAlign, verticalAlign } =
          getIconTextAlignment(nextContainer);
        const nextText = newElementWith(el, {
          verticalAlign,
          textAlign,
          ...(value.kind === "set" ? { strokeColor: value.palette.text } : {}),
        } as Record<string, any>);
        // recompute the bound text's position/size, otherwise the cached
        // bounding box keeps it where it was.
        redrawTextBoundingBox(nextText as any, nextContainer, app.scene);
        return nextText;
      }
      return el;
    });

    return {
      elements: nextElements,
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  PanelComponent: ({ appState, updateData, app }) => {
    const [error, setError] = useState<string | null>(null);
    const [raw, setRaw] = useState("");
    const [library, setLibrary] = useState<LibraryIcon[]>([]);
    const [search, setSearch] = useState("");
    const [importing, setImporting] = useState(false);
    const [dropActive, setDropActive] = useState(false);
    const [mode, setMode] = useState<null | "paste" | "library">(null);

    const selected = app.scene
      .getSelectedElements(appState)
      .filter((el: ExcalidrawElement) => isIconableElement(el));
    const target = selected.length === 1 ? selected[0] : undefined;
    const icon = target ? getShapeIcon(target) : undefined;

    useEffect(() => {
      let live = true;
      listLibraryIcons()
        .then((icons) => live && setLibrary(icons))
        .catch(() => live && setError("Could not read the icon library"));
      return () => {
        live = false;
      };
    }, []);

    const groups = useMemo(() => {
      const needle = search.trim().toLowerCase();
      const matching = needle
        ? library.filter(
            (entry) =>
              entry.name.toLowerCase().includes(needle) ||
              entry.category.toLowerCase().includes(needle),
          )
        : library;
      return groupIconsByCategory(matching);
    }, [library, search]);

    const applySvg = async (clean: string | null) => {
      if (!clean) {
        setError("Invalid SVG");
        return;
      }
      setError(null);
      const palette = await extractPalette(clean);
      // Decode before committing. The canvas renderer is synchronous and draws
      // whatever is cached at that moment, and nothing schedules a repaint when
      // a decode lands later — so without this the icon stays invisible until
      // some other edit repaints the scene.
      await preloadIconImage(clean);
      updateData({ kind: "set", svg: clean, palette });
    };

    const ingest = async (files: { path: string; text: string }[]) => {
      if (files.length === 0) {
        setError("No .svg files found in what you dropped");
        return;
      }
      setImporting(true);
      try {
        const { imported, rejected } = await importIcons(files);
        setLibrary(await listLibraryIcons());
        setError(
          rejected.length > 0
            ? `Skipped ${rejected.length} unreadable file${
                rejected.length === 1 ? "" : "s"
              }, added ${imported.length}`
            : null,
        );
      } catch {
        setError("Could not save to the icon library");
      } finally {
        setImporting(false);
      }
    };

    return (
      <>
        <fieldset>
          <legend>Icon</legend>
          {/* One compact row by default. The source controls are the rarely
              used part, so they stay collapsed rather than filling the panel. */}
          <div className="shape-icon-actions">
            <button
              type="button"
              className={clsx("shape-icon-action", {
                active: mode === "library",
              })}
              title={
                library.length > 0
                  ? `${library.length} icons in your library`
                  : "Add your own icons"
              }
              onClick={() => setMode(mode === "library" ? null : "library")}
            >
              Library
            </button>
            <label className="shape-icon-action" title="Upload a single SVG">
              Upload
              <input
                type="file"
                accept=".svg,image/svg+xml"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    applySvg(sanitizeSvg(await file.text()));
                  }
                  // let the same file be picked again
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              className={clsx("shape-icon-action", {
                active: mode === "paste",
              })}
              onClick={() => setMode(mode === "paste" ? null : "paste")}
            >
              Paste
            </button>
          </div>

          {mode === "paste" && (
            <textarea
              className="shape-icon-textarea"
              placeholder="Paste SVG markup"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onBlur={() => raw.trim() && applySvg(sanitizeSvg(raw))}
            />
          )}

          {mode === "library" && (
            <>
              <div
                className={clsx("shape-icon-dropzone", { active: dropActive })}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={async (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDropActive(false);
                  // must read the entries before yielding: the browser empties
                  // DataTransferItemList as soon as the handler returns
                  const files = await collectDroppedSvgs(event.dataTransfer);
                  await ingest(files);
                }}
              >
                {importing ? "Importing…" : "Drop a folder of SVGs"}
                <label
                  className="shape-icon-file"
                  title="Pick a folder of SVGs; nested folders become categories"
                >
                  {LoadIcon}
                  Choose folder
                  <input
                    type="file"
                    accept=".svg,image/svg+xml"
                    multiple
                    // non-standard but the only way to pick a directory
                    {...{ webkitdirectory: "", directory: "" }}
                    onChange={async (event) => {
                      const picked = Array.from(event.target.files ?? []);
                      await ingest(
                        await Promise.all(
                          picked
                            .filter((file) => /\.svg$/i.test(file.name))
                            .map(async (file) => ({
                              // webkitRelativePath carries the folder structure
                              path:
                                (file as any).webkitRelativePath || file.name,
                              text: await file.text(),
                            })),
                        ),
                      );
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>

              {library.length > 0 && (
                <>
                  <input
                    className="shape-icon-search"
                    type="search"
                    placeholder={`Search ${library.length} icons`}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <div className="shape-icon-library">
                    {groups.map(({ category, icons }) => (
                      <div key={category || "__root"}>
                        <div className="shape-icon-category">
                          {category || "Uncategorised"}
                        </div>
                        <div className="shape-icon-grid">
                          {icons.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              className="shape-icon-swatch"
                              title={entry.name}
                              disabled={!target}
                              onClick={() => applySvg(entry.svg)}
                            >
                              <img
                                src={svgToDataUrl(entry.svg)}
                                alt={entry.name}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {groups.length === 0 && (
                      <div className="shape-icon-category">No matches</div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {error && <div className="shape-icon-error">{error}</div>}

          {icon && (
            <>
              <div className="buttonList shape-icon-placements">
                <RadioSelection<ShapeIconPlacement>
                  group="shape-icon-placement"
                  options={SHAPE_ICON_PLACEMENTS.map((placement) => ({
                    value: placement,
                    text: PLACEMENT_LABELS[placement],
                    icon: PLACEMENT_ICONS[placement],
                    testId: `shape-icon-placement-${placement}`,
                  }))}
                  value={icon.placement}
                  onChange={(placement) =>
                    updateData({ kind: "placement", placement })
                  }
                />
              </div>

              <div className="shape-icon-size">
                <input
                  type="range"
                  min={MIN_ICON_SIZE}
                  max={Math.max(
                    MIN_ICON_SIZE,
                    Math.min(
                      MAX_ICON_SIZE,
                      // no point offering sizes larger than the shape
                      Math.round(
                        Math.min(target!.width, target!.height) ||
                          MAX_ICON_SIZE,
                      ),
                    ),
                  )}
                  step={1}
                  value={Math.round(getIconSize(target!))}
                  onChange={(event) =>
                    updateData({
                      kind: "size",
                      size: Number(event.target.value),
                    })
                  }
                />
                <span className="shape-icon-size-value">
                  {Math.round(getIconSize(target!))}px
                  {icon.size === undefined && " (auto)"}
                </span>
                {icon.size !== undefined && (
                  <button
                    type="button"
                    className="shape-icon-reset"
                    title="Size the icon from the shape again"
                    onClick={() =>
                      updateData({ kind: "size", size: undefined })
                    }
                  >
                    Auto
                  </button>
                )}
              </div>

              <CheckboxItem
                className="shape-icon-checkbox"
                checked={isContainerLayout(icon)}
                onChange={(isContainer) =>
                  updateData({ kind: "container", isContainer })
                }
              >
                Text next to icon
              </CheckboxItem>

              <FilledButton
                variant="outlined"
                color="muted"
                size="medium"
                fullWidth
                label="Remove icon"
                icon={TrashIcon}
                onClick={() => updateData({ kind: "remove" })}
              >
                Remove icon
              </FilledButton>
            </>
          )}
        </fieldset>
      </>
    );
  },
});
