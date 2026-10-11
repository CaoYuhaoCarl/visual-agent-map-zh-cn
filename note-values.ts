/** What a managed note section or heading reads back as after Repository writes it; readback checks compare against these. */
export const managedSectionValue = (value: string): string => value.trim();
export const managedHeadingValue = (value: string): string => value.replace(/\n/g, " ").trim();
