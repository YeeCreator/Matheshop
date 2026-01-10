
export type CanvasCellBlockViewProps = {
  htmlContent: string
}

export default function CanvasCellBlockView(props: CanvasCellBlockViewProps) {
  return <div className="cell-blocks" dangerouslySetInnerHTML={{ __html: props.htmlContent }} />
}

