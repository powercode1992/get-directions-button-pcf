/*!
 * Get Directions (gc) — PowerApps Component Framework control
 * Copyright © 2026 Gc Solutions. All rights reserved.
 *
 * Provided "AS IS", without warranty of any kind. Routing, distance and map data
 * are supplied by third-party providers (Google Maps, Microsoft Bing Maps, Apple
 * Maps, OpenStreetMap). Their accuracy, availability and terms of use are the sole
 * responsibility of those providers. Verify all routes before travel.
 */
import { Nullable } from "../types";

/** Supported external maps providers. Mirrors the gc_Provider enum in the manifest. */
export type MapProvider = "google" | "bing" | "apple" | "osm";

export const DEFAULT_PROVIDER: MapProvider = "google";

export interface AddressParts {
    street?: Nullable<string>;
    city?: Nullable<string>;
    postalCode?: Nullable<string>;
    country?: Nullable<string>;
}

/**
 * Join the populated address parts into a single, human-readable line.
 * Empty/whitespace parts are dropped. Postal code precedes the city (DE/EU convention),
 * e.g. "Karlsruher Str. 1, 76227 Karlsruhe, DE".
 */
export function composeAddress(parts: AddressParts): string {
    const clean = (v: Nullable<string>): string => (v ?? "").trim();

    const street = clean(parts.street);
    const cityLine = [clean(parts.postalCode), clean(parts.city)].filter(Boolean).join(" ");
    const country = clean(parts.country);

    return [street, cityLine, country].filter(Boolean).join(", ");
}

/** True when at least one address part is populated. */
export function hasAddress(parts: AddressParts): boolean {
    return composeAddress(parts).length > 0;
}

/**
 * Normalise an arbitrary string (e.g. a manifest enum value) into a known MapProvider,
 * falling back to the default when the value is missing or unrecognised.
 */
export function toMapProvider(value: Nullable<string>): MapProvider {
    switch (value) {
        case "bing":
        case "apple":
        case "osm":
        case "google":
            return value;
        default:
            return DEFAULT_PROVIDER;
    }
}

/**
 * Build a "directions to destination" deep link for the given provider.
 * The origin is intentionally omitted so each provider uses the user's current
 * location. Returns `null` when no address is available.
 */
export function buildDirectionsUrl(provider: MapProvider, parts: AddressParts): string | null {
    const address = composeAddress(parts);
    if (!address) return null;

    const q = encodeURIComponent(address);
    switch (provider) {
        case "bing":
            return `https://www.bing.com/maps?rtp=~adr.${q}`;
        case "apple":
            return `https://maps.apple.com/?daddr=${q}`;
        case "osm":
            // OpenStreetMap has no "from current location" route link; open the destination search.
            return `https://www.openstreetmap.org/search?query=${q}`;
        case "google":
        default:
            return `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    }
}
