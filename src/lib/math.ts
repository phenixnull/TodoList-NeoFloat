export function markdownWithHardBreaks(input: string): string {
  return input.replace(/\n/g, '  \n')
}

export function hasMathToken(input: string): boolean {
  return /\$[^$]+\$|\$\$[\s\S]+?\$\$/.test(input)
}
