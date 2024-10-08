/****************************************************************************
 ** @license
 ** This demo file is part of yFiles for HTML 2.6.0.4.
 ** Copyright (c) 2000-2024 by yWorks GmbH, Vor dem Kreuzberg 28,
 ** 72070 Tuebingen, Germany. All rights reserved.
 **
 ** yFiles demo files exhibit yFiles for HTML functionalities. Any redistribution
 ** of demo files in source code or binary form, with or without
 ** modification, is not permitted.
 **
 ** Owners of a valid software license for a yFiles for HTML version that this
 ** demo is shipped with are allowed to use the demo source code as basis
 ** for their own yFiles for HTML powered applications. Use of such programs is
 ** governed by the rights and conditions as set out in the yFiles for HTML
 ** license agreement.
 **
 ** THIS SOFTWARE IS PROVIDED ''AS IS'' AND ANY EXPRESS OR IMPLIED
 ** WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 ** MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN
 ** NO EVENT SHALL yWorks BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 ** SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 ** TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 ** PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 ** LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 ** NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 ** SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 **
 ***************************************************************************/
import {
  Arrow,
  ArrowType,
  ChainSubstructureStyle,
  Color,
  CycleSubstructureStyle,
  DefaultLabelStyle,
  EdgePathLabelModel,
  ExteriorLabelModel,
  ExteriorLabelModelPosition,
  GraphBuilder,
  GraphComponent,
  GraphHighlightIndicatorManager,
  GraphItemTypes,
  GraphViewerInputMode,
  IEdge,
  IModelItem,
  IndicatorEdgeStyleDecorator,
  IndicatorNodeStyleDecorator,
  INode,
  LayoutExecutor,
  License,
  OrganicLayout,
  OrganicLayoutStarSubstructureStyle,
  ParallelEdgeRouter,
  ParallelSubstructureStyle,
  Point,
  PolylineEdgeStyle,
  ShapeNodeShape,
  ShapeNodeStyle,
  Size,
  Stroke,
  VoidLabelStyle,
  WebGL2GraphModelManager,
  WebGL2SelectionIndicatorManager
} from 'yfiles'
import { GraphSearch } from './utils/Graphsearch'
import * as CodeMirror from 'codemirror'
import 'codemirror/mode/cypher/cypher'
import 'codemirror/lib/codemirror.css'

import {
  applyDemoTheme,
  createDemoEdgeStyle,
  createDemoNodeStyle
} from 'demo-resources/demo-styles'
import { createGraphBuilder } from './Neo4jGraphBuilder'
import type { Integer, Neo4jRecord, Node, Relationship, Result } from './Neo4jUtil'
import { connectToDB, Neo4jEdge, Neo4jNode } from './Neo4jUtil'
import { fetchLicense } from 'demo-resources/fetch-license'
import { finishLoading, showLoadingIndicator } from 'demo-resources/demo-page'

let editor: CodeMirror.EditorFromTextArea

let graphComponent: GraphComponent
//let graphComponent: WebGL2GraphModelManager

let runCypherQuery: (query: string, params?: Record<string, any>) => Promise<Result>

let graphBuilder: GraphBuilder

let nodes: Node[] = []

let edges: Relationship[] = []

// MY GRAPH SEARCH IMPLEMENTATION
let graphSearch: CustomGraphSearch

class CustomGraphSearch extends GraphSearch {
  /**
   * Returns whether the given node is a match when searching for the given text.
   * This method searches the matching string to the labels and the tags of the nodes.
   * @param node The node to be examined
   * @param text The text to be queried
   * @returns True if the node matches the text, false otherwise
   */
  matches(node: INode, text: string): boolean {
    const lowercaseText = text.toLowerCase()
    // the icon property does not have to be matched
    if (
      node.tag &&
      Object.getOwnPropertyNames(node.tag).some(
        (prop) =>
          prop !== 'icon' &&
          node.tag[prop] &&
          node.tag[prop].toString().toLowerCase().indexOf(lowercaseText) !== -1
      )
    ) {
      return true
    }
    return node.labels.some((label) => label.text.toLowerCase().indexOf(lowercaseText) !== -1)
  }
}

function initializeGraphSearch(): void {
  graphSearch = new CustomGraphSearch(graphComponent)
  graphSearch.highlightStyle = new IndicatorNodeStyleDecorator({
    wrapped: new ShapeNodeStyle({
      shape: ShapeNodeShape.ROUND_RECTANGLE,
      stroke: '3px red',
      fill: null
    }),
    padding: 5
  })
  GraphSearch.registerEventListener(searchBox, graphSearch)
}


// get hold of some UI elements

const labelsContainer = document.querySelector<HTMLParagraphElement>('#labelsContainer')!
const detailsContainer = document.querySelector<HTMLDivElement>('#detailsContainer')!
const selectedNodeContainer = document.querySelector<HTMLDivElement>('#selected-node-container')!
const propertyTable = document.querySelector<HTMLTableElement>('#propertyTable')!
//const propertyTableHeader = propertyTable.firstElementChild as HTMLTableHeaderCellElement
const numNodesInput = document.querySelector<HTMLInputElement>('#numNodes')!
const numLabelsInput = document.querySelector<HTMLInputElement>('#numLabels')!
const showEdgeLabelsCheckbox = document.querySelector<HTMLInputElement>('#showEdgeLabels')!
const queryErrorContainer = document.querySelector<HTMLPreElement>('#queryError')!
const searchBox = document.querySelector<HTMLInputElement>('#search-box')!

/**
 * Runs the demo.
 */
async function run(): Promise<void> {
  License.value = await fetchLicense()
  if (!('WebSocket' in window)) {
    // early exit the application if WebSockets are not supported
    document.querySelector<HTMLDivElement>('#login')!.hidden = true
    document.querySelector<HTMLDivElement>('#noWebSocketAPI')!.hidden = false
    return
  }

  graphComponent = new GraphComponent('graphComponent')
  graphComponent.graphModelManager = new WebGL2GraphModelManager();
  graphComponent.selectionIndicatorManager = new WebGL2SelectionIndicatorManager();
  applyDemoTheme(graphComponent)

  initializeGraphDefaults()
  initializeHighlighting()
  initializeGraphSearch()
  createInputMode()
  initializeUI()
}

/**
 * Initializes the styles for the graph nodes, edges, labels.
 */
function initializeGraphDefaults(): void {
  const graph = graphComponent.graph

  graph.nodeDefaults.style = createDemoNodeStyle()
  graph.nodeDefaults.size = new Size(30, 30)

  graph.edgeDefaults.labels.style = new DefaultLabelStyle({
    backgroundFill: 'rgba(255,255,255,0.85)',
    textFill: '#336699'
  })

  const newExteriorLabelModel = new ExteriorLabelModel({ insets: 5 })
  graph.nodeDefaults.labels.layoutParameter = newExteriorLabelModel.createParameter(
    ExteriorLabelModelPosition.SOUTH
  )

  graph.edgeDefaults.style = createDemoEdgeStyle()
  graph.edgeDefaults.labels.layoutParameter = new EdgePathLabelModel().createDefaultParameter()
}



/**
 * Creates highlight styling. See the GraphViewer demo for more details.
 */
function initializeHighlighting(): void {
  const orangeRed = Color.ORANGE_RED
  const orangeStroke = new Stroke(orangeRed.r, orangeRed.g, orangeRed.b, 220, 3).freeze()

  const nodeStyleHighlight = new IndicatorNodeStyleDecorator({
    wrapped: new ShapeNodeStyle({
      shape: ShapeNodeShape.ROUND_RECTANGLE,
      stroke: orangeStroke,
      fill: null
    }),
    padding: 5
  })

  const dummyCroppingArrow = new Arrow({
    type: ArrowType.NONE,
    cropLength: 5
  })
  const edgeStyleHighlight = new IndicatorEdgeStyleDecorator({
    wrapped: new PolylineEdgeStyle({
      stroke: orangeStroke,
      targetArrow: dummyCroppingArrow,
      sourceArrow: dummyCroppingArrow
    })
  })
  graphComponent.highlightIndicatorManager = new GraphHighlightIndicatorManager({
    nodeStyle: nodeStyleHighlight,
    edgeStyle: edgeStyleHighlight
  })

  graphComponent.addCurrentItemChangedListener(() => onCurrentItemChanged())
}

/**
 * Initialize and configure the input mode. Only allow viewing of the data and moving nodes around.
 */
function createInputMode(): void {
  const mode = new GraphViewerInputMode({
    clickableItems: GraphItemTypes.NODE,
    focusableItems: GraphItemTypes.NODE,
    selectableItems: GraphItemTypes.NONE
  })
  mode.marqueeSelectionInputMode.enabled = false

  mode.itemHoverInputMode.enabled = true
  mode.itemHoverInputMode.hoverItems = GraphItemTypes.EDGE | GraphItemTypes.NODE
  mode.itemHoverInputMode.discardInvalidItems = false
  mode.itemHoverInputMode.addHoveredItemChangedListener((_, evt) => onHoveredItemChanged(evt.item))

  // load more data on double click
  mode.addItemDoubleClickedListener(async (_, { item }) => {
    const result = await runCypherQuery(
      `MATCH (n)-[e]-(m)
       WHERE id(n) = $nodeId
       RETURN DISTINCT e, m LIMIT 50`,
      { nodeId: item.tag.identity }
    )
    let updated = false
    for (const record of result.records) {
      const node = record.get('m')
      const edge = record.get('e')
      if (nodes.every((n) => !n.identity.equals(node.identity))) {
        nodes.push(node)
        updated = true
      }
      if (edges.every((e) => !e.identity.equals(edge.identity))) {
        edges.push(edge)
        updated = true
      }
    }
    if (updated) {
      graphBuilder.updateGraph()
      await doLayout()
    }
  })

  graphComponent.inputMode = mode
}

/**
 * If the currentItem property on GraphComponent's changes we adjust the details panel.
 */
function onCurrentItemChanged(): void {
  // clear the current display
  labelsContainer.innerHTML = '';
  detailsContainer.innerHTML = '';
  // while (propertyTable.lastChild != null) {
  //   propertyTable.removeChild(propertyTable.lastChild)
  // }

  const currentItem = graphComponent.currentItem
  const isNode = currentItem instanceof INode
  selectedNodeContainer.hidden = !isNode
  if (isNode) {
    const node = currentItem
   
    // show all labels of the current node
    labelsContainer.textContent = node.tag.labels.join(', ')
    
    const properties = node.tag.properties
    console.log(properties, node)
    //grab coords of the node and zoom to it
    const [nodePositionX, nodePositionY] = [node.layout.x, node.layout.y];
    graphComponent.zoomToAnimated(new Point(nodePositionX, nodePositionY), 2)
    
    if (properties && Object.keys(properties).length > 0) {
      // Create a div structure instead of a table for each property
      const nameElement = document.createElement('h3');
      nameElement.textContent = node.tag.name;
      detailsContainer.appendChild(nameElement);
      
      for (const [propertyName, propertyValue] of Object.entries(properties)) {
        const propertyDiv = document.createElement('div');
        propertyDiv.classList.add('property');
        
        const propertyNameDiv = document.createElement('div');
        propertyNameDiv.classList.add('property-name');
        propertyNameDiv.textContent = `${propertyName}:`;
        
        const propertyValueDiv = document.createElement('div');
        propertyValueDiv.classList.add('property-value');
        propertyValueDiv.textContent = propertyValue.toString();
        
        propertyDiv.appendChild(propertyNameDiv);
        propertyDiv.appendChild(propertyValueDiv);
        detailsContainer.appendChild(propertyDiv);
      }
    }
  }
}

/**
 * Loads the graph data from the Neo4j database and constructs a graph using a custom
 * {@link GraphBuilder}.
 * @yjs:keep = nodeIds,end
 */
async function loadGraph(): Promise<void> {
  // show a loading indicator, as the queries can take a while to complete
  await showLoadingIndicator(true)
  setUIDisabled(true)

  graphComponent.graph.clear()
  // maximum number of nodes that should be fetched
  const numNodes = parseInt(numNodesInput.value)
  // minimum number of labels that should be present in the returned data
  const numLabels = parseInt(numLabelsInput.value)

  // letters that are used as names for nodes in the cypher query
  const letters = ['a', 'b', 'c', 'd', 'e'].slice(0, numLabels)
  // we match a chain of nodes that is at least numLabels long
  const matchClause = letters.map((letter) => `(${letter})`).join('--')
  const whereClauses = []
  for (let i = 1; i < numLabels; ++i) {
    for (let j = 0; j < i; ++j) {
      // each node in the chain should have at least one label that the previous nodes do not have
      whereClauses.push(
        `any(label IN labels(${letters[i]}) WHERE NOT label IN labels(${letters[j]}))`
      )
    }
  }
  // run the query to get the nodes
  const nodeResult = await runCypherQuery(`MATCH ${matchClause}
      WHERE ${whereClauses.join(' AND ')}
      WITH [${letters.join(',')}] AS nodes LIMIT ${numNodes * numLabels}
      UNWIND nodes AS node
      RETURN DISTINCT node`)
  // extract the nodes from the query result
  nodes = nodeResult.records.map((record: Neo4jRecord) => record.get('node'))
  // obtain an array of all node ids
  const nodeIds = nodes.map((node) => node.identity)
  // get all edges between all nodes that we have, omitting self loops and limiting the overall number of
  // results to a multiple of numNodes, as some graphs have nodes wth degrees in the thousands
  const edgeResult = await runCypherQuery(
    `MATCH (n)-[edge]-(m)
            WHERE id(n) IN $nodeIds
            AND id(m) IN $nodeIds
            AND startNode(edge) <> endNode(edge)
            RETURN DISTINCT edge LIMIT ${numNodes * 5}`,
    { nodeIds }
  )
  // extract the edges from the query result
  edges = edgeResult.records.map((record: Neo4jRecord) => record.get('edge'))
  // custom GraphBuilder that assigns nodes different styles based on their labels
  graphBuilder = createGraphBuilder(graphComponent, nodes, edges)

  graphBuilder.buildGraph()

  // apply a layout to the new graph
  await doLayout()

  await showLoadingIndicator(false)
  setUIDisabled(false)
}

/**
 * This method will be called whenever the mouse moves over a different item. We show a highlight
 * indicator to make it easier for the user to understand the graph's structure.
 * @param hoveredItem The currently hovered item
 */
function onHoveredItemChanged(hoveredItem: IModelItem | null): void {
  // we use the highlight manager of the GraphComponent to highlight related items
  const manager = graphComponent.highlightIndicatorManager

  // first remove previous highlights
  manager.clearHighlights()
  // then see where we are hovering over, now
  if (!hoveredItem) {
    return
  }
  manager.addHighlight(hoveredItem)
  if (hoveredItem instanceof INode) {
    // and if it's a node, we highlight all adjacent edges, too
    graphComponent.graph.edgesAt(hoveredItem).forEach((edge) => {
      manager.addHighlight(edge)
    })
  } else if (hoveredItem instanceof IEdge) {
    // if it's an edge - we highlight the adjacent nodes
    manager.addHighlight(hoveredItem.sourceNode!)
    manager.addHighlight(hoveredItem.targetNode!)
  }
}

/**
 * Applies an organic layout to the current graph. Tries to highlight substructures in the process.
 */
async function doLayout(): Promise<void> {
  setUIDisabled(true)
  const organicLayout = new OrganicLayout()
  organicLayout.chainSubstructureStyle = ChainSubstructureStyle.STRAIGHT_LINE
  organicLayout.cycleSubstructureStyle = CycleSubstructureStyle.CIRCULAR
  organicLayout.parallelSubstructureStyle = ParallelSubstructureStyle.STRAIGHT_LINE
  organicLayout.starSubstructureStyle = OrganicLayoutStarSubstructureStyle.CIRCULAR
  organicLayout.minimumNodeDistance = 60
  organicLayout.considerNodeLabels = true
  organicLayout.considerNodeSizes = true
  organicLayout.deterministic = true
  organicLayout.nodeEdgeOverlapAvoided = true
  organicLayout.qualityTimeRatio = 0.8
  ;(organicLayout.parallelEdgeRouter as ParallelEdgeRouter).joinEnds = true
  ;(organicLayout.parallelEdgeRouter as ParallelEdgeRouter).lineDistance = 15
  try {
    await new LayoutExecutor({
      graphComponent,
      layout: organicLayout,
      duration: '1s',
      animateViewport: true
    }).start()
  } finally {
    setUIDisabled(false)
  }
}

/**
 * Disables the HTML elements of the UI.
 * @param value Whether the elements should be disabled.
 */
function setUIDisabled(value: boolean): void {
  document.querySelector<HTMLButtonElement>('#reloadDataButton')!.disabled = value
  numNodesInput.disabled = value
  numLabelsInput.disabled = value
}

/**
 * Wires up the UI.
 * @yjs:keep = setValue,getValue
 */
function initializeUI(): void {
  document
    .querySelector<HTMLButtonElement>('#reloadDataButton')!
    .addEventListener('click', () => loadGraph())

  // toggle edge label display
  showEdgeLabelsCheckbox.addEventListener('input', () => {
    const graph = graphComponent.graph
    const style = showEdgeLabelsCheckbox.checked
      ? graph.edgeDefaults.labels.style
      : new VoidLabelStyle()
    for (const label of graph.edgeLabels) {
      graph.setStyle(label, style)
    }
  })

  const userEl = document.querySelector<HTMLInputElement>('#userInput')!
  const hostEl = document.querySelector<HTMLInputElement>('#hostInput')!
  const passwordEl = document.querySelector<HTMLInputElement>('#passwordInput')!
  const databaseEl = document.querySelector<HTMLInputElement>('#databaseNameInput')!

  document.querySelector<HTMLFormElement>('#login-form')!.addEventListener('submit', async (e) => {
    e.preventDefault()
    let url = hostEl.value
    if (url.indexOf('://') < 0) {
      url = `neo4j://${url}`
    }
    const user = userEl.value
    const pass = passwordEl.value
    const database = databaseEl.value
    try {
      runCypherQuery = await connectToDB(url, database, user, pass)

      // hide the login form and show the graph component
      document.querySelector<HTMLDivElement>('#loginPane')!.setAttribute('style', 'display: none;')
      document.querySelector<HTMLElement>('#graphPane')!.style.visibility = 'visible'
      document.querySelector<HTMLElement>('#queryPane')!.style.visibility = 'visible'
      await loadGraph()
    } catch (e) {
      document.querySelector<HTMLDivElement>('#connectionError')!.innerHTML =
        `An error occurred: ${e}`
      // In some cases (connecting from https to http) an exception is thrown outside the promise
      if (window.location.protocol === 'https:') {
        document.querySelector<HTMLDivElement>('#openInHttp')!.hidden = false
        document
          .querySelector<HTMLDivElement>('#openInHttp>a')!
          .setAttribute('href', window.location.href.replace('https:', 'http:'))
      }
    }
  })

  numNodesInput.addEventListener(
    'input',
    () => {
      document.querySelector<HTMLDivElement>('#numNodesLabel')!.textContent =
        numNodesInput.value.toString()
    },
    true
  )

  numLabelsInput.addEventListener(
    'input',
    () => {
      document.querySelector<HTMLDivElement>('#numLabelsLabel')!.textContent =
        numLabelsInput.value.toString()
    },
    true
  )

  // create cypher query editor
  editor = CodeMirror.fromTextArea(
    document.querySelector<HTMLTextAreaElement>('#query-text-area')!,
    {
      lineNumbers: true,
      mode: 'cypher'
    } as CodeMirror.EditorConfiguration
  )
  editor.setValue('MATCH (n)-[e]-(m)\nRETURN * LIMIT 150')

  document
    .querySelector<HTMLButtonElement>('#run-cypher-button')!
    .addEventListener('click', async () => {
      const query = editor.getValue()
      let result: Result
      try {
        result = await runCypherQuery(query)
      } catch (e) {
        queryErrorContainer.textContent = `Query failed: ${e}`
        return
      }
      queryErrorContainer.textContent = ''
      // use maps to make sure that each id gets included only once
      const nodeMap = new Map<string, Node>()
      const relationshipMap = new Map<string, Relationship>()
      for (const record of result.records) {
        record.forEach((field: any) => {
          if (field instanceof Neo4jNode) {
            nodeMap.set(String(field.identity), field)
          } else if (field instanceof Neo4jEdge) {
            relationshipMap.set(String(field.identity), field)
          }
        })
      }
      nodes = Array.from(nodeMap.values())
      edges = Array.from(relationshipMap.values())

      graphComponent.graph.clear()
      graphBuilder = createGraphBuilder(graphComponent, nodes, edges)
      graphBuilder.buildGraph()
      // apply a layout to the new graph
      await doLayout()
    })
}

run().then(finishLoading)
