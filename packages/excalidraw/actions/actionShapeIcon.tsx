import { useState, type JSX } from "react";

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
import { sanitizeSvg, extractPalette } from "../data/svgIcon";

import { register } from "./register";

import "./ShapeIcon.scss";

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
      <>
        <fieldset>
          <legend>Icon</legend>
          <div className="shape-icon-source">
            <textarea
              className="shape-icon-textarea"
              placeholder="Paste SVG markup"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
              onBlur={() => raw.trim() && applySvg(sanitizeSvg(raw))}
            />
            <label className="shape-icon-file" title="Upload an SVG file">
              {LoadIcon}
              Upload SVG
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
            {error && <div className="shape-icon-error">{error}</div>}
          </div>
        </fieldset>

        {icon && (
          <>
            <fieldset>
              <legend>Icon position</legend>
              <div className="buttonList">
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
            </fieldset>

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
      </>
    );
  },
});
