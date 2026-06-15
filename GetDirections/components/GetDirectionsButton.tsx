/*!
 * Get Directions (gc) — PowerApps Component Framework control
 * Copyright © 2026 Gc Solutions. All rights reserved. Provided "AS IS", without warranty of any kind.
 */
import * as React from "react";
import { Button, makeStyles, tokens } from "@fluentui/react-components";

export interface GetDirectionsButtonProps {
    /** Text shown on the button. */
    label: string;
    /** Accessible label for screen readers. */
    ariaLabel: string;
    /** Disable the button (host form read-only, or no address available). */
    isDisabled: boolean;
    onClick: () => void;
}

const useStyles = makeStyles({
    root: {
        display: "flex",
        alignItems: "center",
        padding: tokens.spacingHorizontalS,
    },
});

export const GetDirectionsButton: React.FC<GetDirectionsButtonProps> = ({
    label,
    ariaLabel,
    isDisabled,
    onClick,
}) => {
    const styles = useStyles();

    return (
        <div className={styles.root}>
            <Button appearance="primary" disabled={isDisabled} aria-label={ariaLabel} onClick={onClick}>
                {label}
            </Button>
        </div>
    );
};
