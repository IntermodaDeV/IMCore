export interface IEmployee {
  Company_Code: string
  Employee_Code: string
  Name: string
  MiddleName?: string
  LastName: string
  SecondLastName?: string
  Employee_Name: string
  Country_Code: string
}

export interface ICompany {
  COD_EMPRESA: string
  DES_RAZON_SOCIAL: string
  DES_NOMBRE_COMERCIAL: string
  COD_PAIS?: string
  IMCORE_COMPANY_CODE: string
}
