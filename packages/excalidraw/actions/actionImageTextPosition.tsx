import {
  CaptureUpdateAction,
  newElementWith,
  getBoundTextElement,
  redrawTextBoundingBox,
  getImageTextPosition,
  isImageElement,
  IMAGE_TEXT_POSITIONS,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ImageTextPosition,
} from "@excalidraw/element/types";

import { RadioSelection } from "../components/RadioSelection";
import {
  ImageTextTopIcon,
  ImageTextBottomIcon,
  ImageTextLeftIcon,
  ImageTextRightIcon,
} from "../components/icons";

import { register } from "./register";

import type { JSX } from "react";

const POSITION_ICONS: Record<ImageTextPosition, JSX.Element> = {
  top: ImageTextTopIcon,
  bottom: ImageTextBottomIcon,
  left: ImageTextLeftIcon,
  right: ImageTextRightIcon,
};

const POSITION_LABELS: Record<ImageTextPosition, string> = {
  top: "Above image",
  bottom: "Below image",
  left: "Left of image",
  right: "Right of image",
};

/** the single selected image, or null */
export const getSingleImageTarget = (
  elements: readonly ExcalidrawElement[],
): ExcalidrawElement | null => {
  const images = elements.filter(isImageElement);
  return images.length === 1 ? images[0] : null;
};

export const actionImageTextPosition = register<ImageTextPosition>({
  name: "imageTextPosition",
  label: "Label position",
  trackEvent: false,
  perform: (elements, appState, value, app) => {
    const target = getSingleImageTarget(
      app.scene.getSelectedElements(appState),
    );
    if (!value || !target) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const boundText = getBoundTextElement(
      target,
      app.scene.getNonDeletedElementsMap(),
    );
    // the label's position is derived from the image, so the image must carry
    // the new value before the text is laid out against it
    const nextImage = newElementWith(target, {
      customData: { ...target.customData, textPosition: value },
    } as Record<string, any>);

    const nextElements = elements.map((el) => {
      if (el.id === target.id) {
        return nextImage;
      }
      if (boundText && el.id === boundText.id) {
        const nextText = newElementWith(el, {});
        redrawTextBoundingBox(nextText as any, nextImage, app.scene);
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
    const target = getSingleImageTarget(
      app.scene.getSelectedElements(appState),
    );
    if (!target) {
      return null;
    }

    return (
      <fieldset>
        <legend>Label position</legend>
        <div className="buttonList">
          <RadioSelection<ImageTextPosition>
            group="image-text-position"
            options={IMAGE_TEXT_POSITIONS.map((position) => ({
              value: position,
              text: POSITION_LABELS[position],
              icon: POSITION_ICONS[position],
              testId: `image-text-position-${position}`,
            }))}
            value={getImageTextPosition(target)}
            onChange={(position) => updateData(position)}
          />
        </div>
      </fieldset>
    );
  },
});
