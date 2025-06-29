import can

from server.adapter.PCANBasic import *
from server.adapter.base_candapter import BaseCandapter


class PeakPCanAdapter(BaseCandapter):
    def __init__(self, channel: int, can_baudrate: int = PCAN_BAUD_125K):
        super().__init__()
        self._baudrate = can_baudrate
        self._pcan = PCANBasic()

        self.PcanHandle = PCAN_USBBUS1
        self._DLLFound = False

        self.m_objPCANBasic = None

    def connect(self):
        try:
            self.m_objPCANBasic = PCANBasic()
            self._DLLFound = True
        except:
            print("Unable to find the library: PCANBasic.dll !")
            self.getInput("Press <Enter> to quit...")
            self._DLLFound = False
            return

        stsResult = self.m_objPCANBasic.Initialize(self.PcanHandle, self.Bitrate)
        if stsResult != PCAN_ERROR_OK:
            print("Can not initialize. Please check the defines in the code.")
            self.ShowStatus(stsResult)
            print("")
            self.getInput("Press <Enter> to quit...")
            return

        print("Successfully initialized.")
        self.ReadMessages()

    def __del__(self):
        if self._DLLFound:
            self.m_objPCANBasic.Uninitialize(PCAN_NONEBUS)
    def ReadMessages(self):
        """
        Function for reading PCAN-Basic messages
        """
        stsResult = PCAN_ERROR_OK

        ## We read at least one time the queue looking for messages. If a message is found, we look again trying to
        ## find more. If the queue is empty or an error occurr, we get out from the dowhile statement.
        while (not (stsResult & PCAN_ERROR_QRCVEMPTY)):
            if self.IsFD:
                stsResult = self.ReadMessageFD()
            else:
                stsResult = self.ReadMessage()
            if stsResult != PCAN_ERROR_OK and stsResult != PCAN_ERROR_QRCVEMPTY:
                self.ShowStatus(stsResult)
                return

    def ReadMessage(self):
        ## We execute the "Read" function of the PCANBasic
        stsResult = self.m_objPCANBasic.Read(self.PcanHandle)

        if stsResult[0] == PCAN_ERROR_OK:
            ## We show the received message
            self.ProcessMessageCan(stsResult[1], stsResult[2])

        return stsResult[0]

