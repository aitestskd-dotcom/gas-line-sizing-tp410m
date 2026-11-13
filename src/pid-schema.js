const PID_SCHEMA = (function () {
  const VERSION = '1.0.0';
  const ELEMENT_TYPES = ['equipment', 'valve', 'instrument', 'junction', 'boundary', 'safetyDevice'];
  const EQUIPMENT_SUBTYPES = [
    'centrifugal-pump', 'positive-displacement-pump', 'vessel',
    'heat-exchanger', 'column', 'tank', 'other'
  ];
  const VALVE_SUBTYPES = ['gate', 'globe', 'ball', 'check', 'safety', 'control', 'other'];
  const INSTRUMENT_SUBTYPES = ['transmitter', 'indicator', 'controller', 'switch', 'alarm', 'other'];
  const FAIL_STATES = ['FO', 'FC', 'FL', 'none'];
  const ACTUATORS = ['manual', 'pneumatic', 'electric', 'hydraulic', 'none'];
  const MEASURED_VARIABLES = ['flow', 'pressure', 'temperature', 'level', 'analysis', 'other'];
  const FUNCTIONS = ['I', 'T', 'C', 'R', 'S', 'A', 'other'];
  const LOCATIONS = ['field', 'panel', 'dcs', 'other'];
  const CONNECTION_TYPES = ['process', 'signal', 'control', 'mechanical'];
  const SIGNAL_TYPES = ['4-20mA', 'digital', 'pneumatic', 'other'];
  const LOOP_TYPES = ['feedback', 'cascade', 'feedforward', 'other'];
  const SAFETY_SUBTYPES = ['psv', 'rupture-disc', 'relief-valve', 'other'];

  function validate(data) {
    const errors = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return ['Root must be an object'];
    }

    if (data.schemaVersion !== VERSION) errors.push('Unsupported schemaVersion');

    ['projectId', 'pandid', 'revision'].forEach(key => {
      if (typeof data[key] !== 'string' || !data[key].trim()) errors.push(`${key} is required`);
    });

    ['elements', 'connections', 'controlLoops', 'safetyDevices', 'notes'].forEach(key => {
      if (!Array.isArray(data[key])) errors.push(`${key} must be an array`);
    });

    if (errors.length) return errors;

    if (data.elements.length > 5000 || data.connections.length > 10000) {
      return ['Document exceeds prototype limits'];
    }

    const elementIds = new Set();
    const tags = new Set();

    data.elements.forEach((element, index) => {
      if (!element || typeof element !== 'object') {
        errors.push(`Invalid element at index ${index}`);
        return;
      }

      if (typeof element.id !== 'string' || !element.id || elementIds.has(element.id)) {
        errors.push('Element ID is missing or duplicated');
      } else {
        elementIds.add(element.id);
      }

      if (typeof element.tag !== 'string' || !element.tag.trim() || tags.has(element.tag)) {
        errors.push('Element tag is missing or duplicated');
      } else {
        tags.add(element.tag);
      }

      if (!ELEMENT_TYPES.includes(element.type)) {
        errors.push(`Unknown element type: ${element.type}`);
      }

      if (element.type === 'instrument' &&
          !/^[A-Z]{1,4}-?\d{1,5}[A-Z]?$/.test(element.tag)) {
        errors.push(`Instrument tag does not follow ISA-5.1-style format: ${element.tag}`);
      }
    });

    const connectionIds = new Set();

    data.connections.forEach(connection => {
      if (!connection || typeof connection !== 'object') {
        errors.push('Invalid connection');
        return;
      }

      if (typeof connection.id !== 'string' || !connection.id || connectionIds.has(connection.id)) {
        errors.push('Connection ID is missing or duplicated');
      } else {
        connectionIds.add(connection.id);
      }

      if (!elementIds.has(connection.fromId) || !elementIds.has(connection.toId)) {
        errors.push('Connection references an unknown element');
      }

      if (connection.fromId === connection.toId) {
        errors.push('Connection cannot connect an element to itself');
      }

      if (!CONNECTION_TYPES.includes(connection.type)) {
        errors.push(`Unknown connection type: ${connection.type}`);
      }
    });

    data.controlLoops.forEach(loop => {
      if (!loop || !Array.isArray(loop.members) || loop.members.length < 2) {
        errors.push('Control loop must contain at least two members');
        return;
      }

      if (loop.members.some(memberId => !elementIds.has(memberId))) {
        errors.push('Control loop references an unknown element');
      }
    });

    data.safetyDevices.forEach(device => {
      if (!device || !elementIds.has(device.id) || !elementIds.has(device.protectedEquipment)) {
        errors.push('Safety device references an unknown element');
      }

      if (!connectionIds.has(device.inletLine) || !connectionIds.has(device.outletLine)) {
        errors.push('Safety device references an unknown inlet or outlet connection');
      }
    });

    return errors;
  }

  function buildGraph(data) {
    const graph = { nodes: {}, edges: {}, loops: {}, safetyDevices: {} };

    data.elements.forEach(element => {
      graph.nodes[element.id] = element;
    });

    data.connections.forEach(connection => {
      graph.edges[connection.id] = connection;
    });

    data.controlLoops.forEach(loop => {
      graph.loops[loop.id] = loop;
    });

    data.safetyDevices.forEach(device => {
      graph.safetyDevices[device.id] = device;
    });

    return graph;
  }

  function traceProcess(graph, startId, direction) {
    const visited = new Set([startId]);
    const pending = [startId];
    const result = [];

    while (pending.length) {
      const currentId = pending.pop();
      const node = graph.nodes[currentId];

      if (node) result.push(node);

      Object.values(graph.edges).forEach(edge => {
        if (edge.type !== 'process') return;

        const matches = direction === 'upstream'
          ? edge.toId === currentId
          : edge.fromId === currentId;

        const nextId = direction === 'upstream' ? edge.fromId : edge.toId;

        if (matches && !visited.has(nextId)) {
          visited.add(nextId);
          pending.push(nextId);
        }
      });
    }

    return result;
  }

  function traceUpstream(graph, startId) {
    return traceProcess(graph, startId, 'upstream');
  }

  function traceDownstream(graph, startId) {
    return traceProcess(graph, startId, 'downstream');
  }

  return {
    VERSION,
    ELEMENT_TYPES,
    validate,
    buildGraph,
    traceUpstream,
    traceDownstream
  };
})();

if (typeof module !== 'undefined') module.exports = PID_SCHEMA;
