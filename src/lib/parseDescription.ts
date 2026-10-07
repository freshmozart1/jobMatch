type DescriptionSegment = {
    text: string;
    bold: boolean;
};

export function parseDescription(text: string): DescriptionSegment[] {
    const segments: DescriptionSegment[] = [];
    const pattern = /\*\*(.+?)\*\*/gs;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            segments.push({
                text: text.slice(lastIndex, match.index),
                bold: false,
            });
        }
        segments.push({ text: match[1] ?? '', bold: true });
        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < text.length) {
        segments.push({ text: text.slice(lastIndex), bold: false });
    }

    return segments;
}
