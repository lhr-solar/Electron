// Canonical CANdb++ attribute library (MDC v3 predefined seed — SPN is native on signal.spn, not here).
// Single consumer: ProjectEditor "Load predefined CANdb++ attributes".
// dbc2mdc synthesizes its own definitions from BA_DEF_; nothing in Embedded-Sharepoint/can/mdc/lib imports this.

export const PREDEFINED_CAN_ATTRIBUTES = [
  {
    name: 'BusType',
    type: 'enum',
    description: 'Physical bus type (CANdb++ predefined; global BA_DEF_).',
    scopes: ['network'],
    enumValues: ['CAN', 'CAN FD', 'LIN', 'FlexRay'],
    default: 'CAN',
  },
  {
    name: 'VFrameFormat',
    type: 'enum',
    description: 'DBC frame format. Maps to native is_extended_frame/is_fd.',
    scopes: ['message'],
    enumValues: ['StandardCAN', 'ExtendedCAN', 'J1939PG', 'StandardCAN_FD', 'ExtendedCAN_FD'],
    default: 'StandardCAN',
  },
  {
    name: 'GenMsgSendType',
    type: 'enum',
    description: 'DBC transmit type (raw label preserved for round-trip; native send_type).',
    scopes: ['message'],
    enumValues: ['Cyclic', 'Event', 'CyclicAndEvent', 'CyclicAndEventNoRepetition', 'None', 'Spontaneous'],
    default: 'Cyclic',
  },
  {
    name: 'GenMsgCycleTime',
    type: 'int',
    description: 'DBC cycle time in ms (mirrors message.cycle_time).',
    scopes: ['message'],
    min: 0,
    max: 100000,
    default: 0,
  },
  {
    name: 'MultiplexExtEnabled',
    type: 'enum',
    description: 'Extended (nested) multiplexing enabled (CANdb++ predefined; global BA_DEF_).',
    scopes: ['network', 'message'],
    enumValues: ['No', 'Yes'],
    default: 'No',
  },
  {
    name: 'GenSigStartValue',
    type: 'float',
    description: "DBC initial/start value of the signal's raw value.",
    scopes: ['signal'],
    default: 0,
  },
];
