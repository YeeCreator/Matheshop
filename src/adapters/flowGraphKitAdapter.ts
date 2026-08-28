import type { Edge, GraphEditorDocument, Node, NodeLayout } from 'flow-graph-kit-vue';

import type { MatheshopBoardSnapshot } from '../core/boardCore';

const DEFAULT_INPUT_PORT_UID = 'in';
const DEFAULT_OUTPUT_PORT_UID = 'out';

const createFlowNode = (snapshot: MatheshopBoardSnapshot, cell: MatheshopBoardSnapshot['cells'][number]): Node => ({
  uid: cell.id,
  node_type: 'matheshop.cell',
  ports: [
    { uid: DEFAULT_INPUT_PORT_UID, direction: 'input', data_type: 'text', metadata: {} },
    { uid: DEFAULT_OUTPUT_PORT_UID, direction: 'output', data_type: 'text', metadata: {} },
  ],
  content: {
    text: cell.content,
    color: cell.color,
    blocks: cell.blocks,
  },
  metadata: {
    seq: cell.seq,
    editing: snapshot.editingCellId === cell.id,
  },
});

const createFlowLayout = (cell: MatheshopBoardSnapshot['cells'][number]): NodeLayout => ({
  node_uid: cell.id,
  x: cell.position.x,
  y: cell.position.y,
  width: cell.size.w,
  height: cell.size.h,
  z_index: 0,
  metadata: {},
});

const createFlowEdge = (edge: MatheshopBoardSnapshot['edges'][number]): Edge => ({
  uid: edge.id,
  source_node_uid: edge.from,
  source_port_uid: DEFAULT_OUTPUT_PORT_UID,
  target_node_uid: edge.to,
  target_port_uid: DEFAULT_INPUT_PORT_UID,
  kind: 'data',
  metadata: {},
});

export function createMatheshopGraphEditorDocument(snapshot: MatheshopBoardSnapshot): GraphEditorDocument {
  return {
    graph: {
      uid: 'matheshop.graph',
      nodes: snapshot.cells.map((cell) => createFlowNode(snapshot, cell)),
      edges: snapshot.edges.map(createFlowEdge),
      metadata: {
        engine_choice: snapshot.engineSelection.choice,
        tool: snapshot.tool,
        status_message: snapshot.statusMessage,
      },
    },
    node_layouts: snapshot.cells.map(createFlowLayout),
    viewport: {
      pan_x: 0,
      pan_y: 0,
      scale: 1,
      metadata: {},
    },
    selection: {
      selected_node_uids: snapshot.selectedCellId ? [snapshot.selectedCellId] : [],
      selected_edge_uids: [],
      primary_node_uid: snapshot.selectedCellId,
      metadata: {
        link_mode: snapshot.linkMode,
        link_from_cell_id: snapshot.linkFromCellId,
      },
    },
    metadata: {
      profile: 'matheshop-adapter',
    },
  };
}