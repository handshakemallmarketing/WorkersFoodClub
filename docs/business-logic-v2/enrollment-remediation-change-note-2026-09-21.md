# Change note

Enrollment now returns the server-issued `publicMemberId`, invoice identifier, invoice amount and currency after successful automatic provisioning. The member remains inactive until trusted settlement.

The settlement boundary now fails closed with `MEMBER_NUMBER_NOT_ISSUED` if an invoice somehow references a legacy membership without a Member Number. It no longer generates a number during payment settlement.
