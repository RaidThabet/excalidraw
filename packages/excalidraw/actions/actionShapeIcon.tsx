import { useState } from "react";

import {
  CaptureUpdateAction,
  newElementWith,
  getBoundTextElement,
  redrawTextBoundingBox,
  getShapeIcon,
  getIconTextAlignment,
  isContainerLayout,
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
  | { kind: "container"; isContainer: boolean }
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
          placement: prevIcon?.placement ?? "center",
          palette: value.palette,
          isContainer: prevIcon ? isContainerLayout(prevIcon) : true,
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
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              marginTop: "0.5rem",
            }}
            title="Lay the text out next to the icon. Off keeps the text centered in the shape."
          >
            <input
              type="checkbox"
              checked={isContainerLayout(icon)}
              onChange={(event) =>
                updateData({
                  kind: "container",
                  isContainer: event.target.checked,
                })
              }
            />
            Container (text next to icon)
          </label>
        )}
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
