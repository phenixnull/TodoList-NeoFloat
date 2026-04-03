export function markdownWithHardBreaks(input: string): string {
  return input.replace(/\n/g, '  \n')
}

export function hasMathToken(input: string): boolean {
  return /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(input)
}

export function hasRichPreviewToken(input: string): boolean {
  if (!input.trim()) {
    return false
  }

  if (hasMathToken(input)) {
    return true
  }

  return /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|(^|\n)\s{0,3}(#{1,6}\s|>\s|[-*+]\s|\d+[.)]\s)|```|`[^`]+`|(^|\n)\s*\|.+\|(?:\n|$)|(^|\n)\s*---+\s*($|\n)|<[^>]+>|(?:\*\*|__|~~)/.test(input)
}
