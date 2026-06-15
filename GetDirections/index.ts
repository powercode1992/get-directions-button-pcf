/*!
 * Get Directions (gc) — PowerApps Component Framework control
 * Copyright © 2026 Gc Solutions. All rights reserved.
 *
 * Provided "AS IS", without warranty of any kind. Routing, distance and map data
 * are supplied by third-party providers (Google Maps, Microsoft Bing Maps, Apple
 * Maps, OpenStreetMap). Their accuracy, availability and terms of use are the sole
 * responsibility of those providers. Verify all routes before travel.
 */
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { App } from "./components/App";

export class GetDirections implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    public init(
        _context: ComponentFramework.Context<IInputs>,
        _notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary
    ): void {
        // No initialisation required — the control reads its bound parameters on every updateView.
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        return React.createElement(App, { context });
    }

    public getOutputs(): IOutputs {
        // The control produces no outputs; it only reads address fields and opens a maps URL.
        return {};
    }

    public destroy(): void {
        // No resources to clean up.
    }
}
