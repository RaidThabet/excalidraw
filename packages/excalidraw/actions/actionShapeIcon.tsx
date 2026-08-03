import { useState } from "react";

import {
  CaptureUpdateAction,
  newElementWith,
  getBoundTextElement,
  redrawTextBoundingBox,
  getShapeIcon,
  isIconableElement,
  SHAPE_ICON_PLACEMENTS,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ShapeIconData,
  ShapeIconPalette,
  ShapeIconPlacement,
} from "@excalidraw/element/types";

import { sanitizeSvg, extractPalette } from "../data/svgIcon";

import { register } from "./register";

type IconActionValue =
  | { kind: "set"; svg: string; palette: ShapeIconPalette }
  | { kind: "placement"; placement: ShapeIconPlacement }
  | { kind: "remove" };

// Corner placements read as one row — `[icon] text` / `text [icon]` — so the
// text aligns to the icon's own edge and shares its row. getIconTextInset
// reserves the icon's width so the two never overlap. `center` stacks the icon
// above the text, which the inset handles vertically instead.
const VALIGN: Record<ShapeIconPlacement, "top" | "middle" | "bottom"> = {
  center: "middle",
  "top-left": "top",
  "top-right": "top",
  "bottom-left": "bottom",
  "bottom-right": "bottom",
};
const HALIGN: Record<ShapeIconPlacement, "left" | "center" | "right"> = {
  center: "center",
  "top-left": "left",
  "top-right": "right",
  "bottom-left": "left",
  "bottom-right": "right",
};

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

    const nextIcon: ShapeIconData | undefined =
      value.kind === "remove"
        ? undefined
        : value.kind === "set"
        ? {
            svg: value.svg,
            placement: prevIcon?.placement ?? "center",
            palette: value.palette,
          }
        : prevIcon
        ? { ...prevIcon, placement: value.placement }
        : undefined;

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
        const nextText = newElementWith(el, {
          // no icon -> back to stock centered text
          verticalAlign: nextIcon ? VALIGN[nextIcon.placement] : "middle",
          textAlign: nextIcon ? HALIGN[nextIcon.placement] : "center",
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

    const selected = app.scene
      .getSelectedElements(appState)
      .filter((el: ExcalidrawElement) => isIconableElement(el));
    const icon = selected.length === 1 ? getShapeIcon(selected[0]) : undefined;

    const applySvg = async (clean: string | null) => {
      if (!clean) {
        setError("Invalid SVG");
        return;
      }
      setError(null);
      const palette = await extractPalette(clean);
      updateData({ kind: "set", svg: clean, palette });
    };

    return (
      <fieldset>
        <legend>Icon</legend>
        <textarea
          style={{ width: "100%", minHeight: "3em", resize: "vertical" }}
          placeholder="Paste SVG markup"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          onBlur={() => raw.trim() && applySvg(sanitizeSvg(raw))}
        />
        <input
          type="file"
          accept=".svg,image/svg+xml"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              applySvg(sanitizeSvg(await file.text()));
            }
          }}
        />
        {error && (
          <div style={{ color: "var(--color-danger, #c92a2a)" }}>{error}</div>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.25rem",
            marginTop: "0.5rem",
          }}
        >
          {SHAPE_ICON_PLACEMENTS.map((placement) => (
            <button
              key={placement}
              type="button"
              disabled={!icon}
              style={{
                fontWeight: icon?.placement === placement ? "bold" : "normal",
              }}
              onClick={() => updateData({ kind: "placement", placement })}
            >
              {placement}
            </button>
          ))}
        </div>
        {icon && (
          <button
            type="button"
            style={{ marginTop: "0.5rem" }}
            onClick={() => updateData({ kind: "remove" })}
          >
            Remove icon
          </button>
        )}
      </fieldset>
    );
  },
});
