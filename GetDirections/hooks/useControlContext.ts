import * as React from "react";
import { IInputs } from "../generated/ManifestTypes";

export interface ControlContextUtils {
    isDisabled: boolean;
    isVisible: boolean;
    userLocale: number;
    openAlert: (text: string, title?: string) => Promise<void>;
    openConfirm: (text: string, title?: string) => Promise<boolean>;
    openUrl: (url: string) => void;
}

export function useControlContext(context: ComponentFramework.Context<IInputs>): ControlContextUtils {
    const isDisabled = context.mode.isControlDisabled;
    const isVisible = context.mode.isVisible;
    const userLocale = context.userSettings.languageId;

    const openAlert = React.useCallback(
        async (text: string, title?: string): Promise<void> => {
            await context.navigation.openAlertDialog({ text }, {});
        },
        [context.navigation]
    );

    const openConfirm = React.useCallback(
        async (text: string, title?: string): Promise<boolean> => {
            const result = await context.navigation.openConfirmDialog({ text, title: title ?? "" }, {});
            return result.confirmed;
        },
        [context.navigation]
    );

    const openUrl = React.useCallback(
        (url: string): void => {
            context.navigation.openUrl(url);
        },
        [context.navigation]
    );

    return { isDisabled, isVisible, userLocale, openAlert, openConfirm, openUrl };
}
