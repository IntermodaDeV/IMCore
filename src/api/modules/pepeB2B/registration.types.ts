// Cliente/sucursal asociado a una solicitud de registro (PepeB2B).
export interface IRegistrationRequestCliente {
  ClienteId?: number
  Codigo?: string | null
  Nombre?: string | null
  Telefono?: string | null
}

// Solicitud de creación de cuenta de cliente pendiente de aprobación.
export interface IRegistrationRequestItem {
  Id: number
  Code: string
  Name?: string | null
  LastName?: string | null
  Email?: string | null
  Status_Id?: number | null
  Creation_Date?: string | null
  Clientes?: IRegistrationRequestCliente[]
}
