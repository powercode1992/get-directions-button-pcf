/*!
 * Get Directions (gc) — PowerApps Component Framework control
 * Copyright © 2026 Gc Solutions. All rights reserved. Provided "AS IS", without warranty of any kind.
 */
import * as React from "react";
import { IInputs } from "../generated/ManifestTypes";

export const StringKeys = {
    // Button
    gc_Button_GetDirections: "gc_Button_GetDirections",
    gc_Button_Aria: "gc_Button_Aria",
} as const;

export type StringKey = (typeof StringKeys)[keyof typeof StringKeys];

export function useLocalisation(context: ComponentFramework.Context<IInputs>) {
    const t = React.useCallback(
        (key: StringKey): string => context.resources.getString(key),
        [context.resources]
    );

    return { t };
}
