# CAN frame over Cap'n Proto (TCP length-prefixed). Used by CapnpTcpParser.
# Wire format per frame: [4 bytes BE uint32 length][serialized CanFrame]

@0xbf1c8a2e4d3f7091;

struct CanFrame {
  arbitrationId @0 :UInt32;
  isExtended @1 :Bool;
  data @2 :Data;
}
