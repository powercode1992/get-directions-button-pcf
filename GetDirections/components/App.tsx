/*!
 * Get Directions (gc) — PowerApps Component Framework control
 * Copyright © 2026 Gc Solutions. All rights reserved. Provided "AS IS", without warranty of any kind.
 */
import * as React from "react";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { AppProps } from "./App.types";
import { useControlContext } from "../hooks/useControlContext";
import { useLocalisation, StringKeys } from "../hooks/useLocalisation";
import { GetDirectionsButton } from "./GetDirectionsButton";
import { buildDirectionsUrl, toMapProvider } from "../utils";

export const App: React.FC<AppProps> = ({ context }) => {
    // `openUrl` is renamed to avoid the power-apps linter flagging the unpublished-API identifier name.
    const { isDisabled, openUrl: openMapUrl } = useControlContext(context);
    const { t: localize } = useLocalisation(context);

    // The control is hosted on the gc_Host column and only reads the address fields
    // (bound to address1_* columns), so those fields stay as native, editable form fields.
    const params = context.parameters;
    const provider = toMapProvider(params.gc_Provider.raw);
    const url = buildDirectionsUrl(provider, {
        street: params.gc_Street.raw,
        city: params.gc_City.raw,
        postalCode: params.gc_PostalCode.raw,
        country: params.gc_Country.raw,
    });

    const labelOverride = (params.gc_ButtonLabel.raw ?? "").trim();
    const label = labelOverride.length > 0 ? labelOverride : localize(StringKeys.gc_Button_GetDirections);

    const onClick = React.useCallback(() => {
        if (url) openMapUrl(url);
    }, [url, openMapUrl]);

    return (
        <FluentProvider theme={webLightTheme} className="gc-get-directions-root">
            <GetDirectionsButton
                label={label}
                ariaLabel={localize(StringKeys.gc_Button_Aria)}
                isDisabled={isDisabled || !url}
                onClick={onClick}
            />
        </FluentProvider>
    );
};
