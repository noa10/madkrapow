export function OrderItemNotes({ notes }: { notes: string | null }) {
  const lines = (notes ?? '').split('|').map((line) => line.trim()).filter(Boolean)

  return lines.map((line, index) => (
    <p key={index} className="text-sm text-muted-foreground mt-1">
      {index === 0 && <><strong>Note:</strong>{' '}</>}{line}
    </p>
  ))
}
