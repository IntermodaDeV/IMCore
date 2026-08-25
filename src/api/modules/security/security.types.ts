export type LoginRequest = {
  Code: string
  password: string
  
	IPAddress?: string
	Device?: string
}

export type LoginResponse = {
  Success: boolean
  SuccessMessage: string
  ErrorMessage: string
  InfoUser: string
  AccessToken?: string
  RefreshToken?: string
  ExpireAt?: string
  // Primer ingreso de un usuario Cooperativa: hay que forzar el cambio de
  // contrasena antes de dejarlo entrar. Lo resuelve la API en el login.
  RequiresPasswordChange?: boolean
}

interface RoleDTO {
  RoleName: string
}

export interface IDefaultCompany {
  Id: number
  Name: string
  Code: string
  Status_Id: number
  CodeIcon: string
}

export interface UsersDTO {
  Id: number
  Code: string
  Name: string
  LastName: string
  Email?: string
  PasswordHash?: string | null,
  ConfirmPassword?: string
  Status_Id: number
  Theme: string
  Access?: string
  /** Empresa del parque a la que pertenece. Viene en el InfoUser del login,
   *  igual que los accesos. No confundir con Companies/DefaultCompany, que son
   *  las compañías de AX por país. */
  Empresa_Id?: number
  Empresa?: string | null
  EmpresaCode?: string | null

  Create_By?: string
  Roles?: RoleDTO[]
  Companies?: string
  DefaultCompany?: IDefaultCompany[] | null
  DefaultCompany_Id?: number | null
  Creation_Date?: string | Date
  ValidateAD?: boolean | null
  // Tipo de usuario (AdmSys.Types, Category 'TiposUsuario').
  TypeId?: number | null
  TypeName?: string
  Payweb:string,
  Modified_By?: string
  Modification_Date?: string | Date | null
  DynamicColumns?: Record<string, string>
  [key: string]: any
}

// Empresa del parque industrial (Intermoda, Industrias Chamer).
//
// ⚠ NO es IDefaultCompany / AdmSys.Companies: esas son las compañías de AX POR
// PAÍS (IMHN, IMGT, IMCR, IMSL), en relación N:M con el usuario, y deciden
// contra qué compañía CONTABLE se reporta. Esta responde otra pregunta —para
// quién trabaja la persona— y es 1:1.
export interface IEmpresa {
  Id: number
  Name: string
  Code: string
  /** base64 SIN el prefijo "data:". Solo viene con incluirLogo=true. */
  Logo?: string | null
  LogoMime?: string | null
  TieneLogo: boolean
  Status_Id: number
}

export interface IRegister {
  Code: string
  Name: string
  LastName: string
  Email?: string
  PasswordHash?: string | null,
  ConfirmPassword?: string
}

export interface IUserExternalCodes {
  Id?: number
  User_Code: string
  KeyVar?: string | null
  ExternalCode: string
  Status_Id: number

  Create_By: string
  Creation_Date?: string | Date | null

  Modified_By?: string | null
  Modification_Date?: string | Date | null
}

export interface UsersSettingsDTO {
  Id: number
  Code: string
  Status_Id: number
  Theme: string
  Modified_By: string
  Options: number
}

export type MenuDTO = {
  Id: number;
  Name: string;
  Description?: string;
  Route: string;
  Icon: string;
  ParentMenu_Id?: number | null;
  MenuOrder?: number | null;
  // Alcance de la opción: 'Both' (app y web), 'App' (solo app), 'Web' (solo web).
  Platform?: 'Both' | 'App' | 'Web';
  Status_Id?: number;
  Status_Name?: string;
  User_Code?: string;
  Create_By?: string;
  Creation_Date?: string;
  Modified_By?: string | null;
  Modification_Date?: string | Date | null;
};

export type AccessDTO = {
  Id: number;
  KeyVar?: string;
  Name?: string;
  Description?: string;
  Category?: string | null;
  Status_Id?: number;
  Create_By?: string;
  Creation_Date?: string;
  Modified_By?: string | null;
  Modification_Date?: string | Date | null;
  Status_Name?: string;
};


export type IAccessControl = {
  Id: number;
  User_Code: string | null;
  Rol_Id: number | null;
  Access_Id: number | null;
  Status_Id: number;
  Type_Id: number;
  Create_By: string;
};

export type IMenuControl = {
  Id: number;
  User_Code: string | null;
  Rol_Id: number | null;
  Menu_Id: number | null;
  Status_Id: number;
  Type_Id: number;
  Create_By: string;
};


export type RolesDTO = {
  Id: number;
  RoleName: string;
  Description: string;
  Status_Id: number;
  StatusName: string;
  Create_By: string;
  Creation_Date: string;
  Modified_By: string | null;
  Modification_Date: string | Date | null;
};

export type CompaniesDTO = {
  Id: number;
  Name: string;
  Code: string;
  Direccion?: string;
  Status_Id: number;
  CodeIcon?: string;
};

export type IUserCompanies = {
  Id: number;
  User_Code: string;
  Company_Id: string;
  IsDefault?: boolean;
  Status_Id: number;
  // Datos de la compañía (vista AdmSys.Vta_UsersCompanies)
  Name?: string;
  Code?: string;
  CodeIcon?: string;
};


export type ITypes = {
  Id: number;
  Name: string;
  Description: string;
  Status_Id: number;
  Category: string;
  Create_By: string;
  Creation_Date: string;
  Modified_By: string | null;
  Modification_Date: string | Date | null;
};


export type IQuickActions = {
  Id: number;
  User_Code?: string;
  Menu_Id: number;
  Status_Id?: number;
  Icon?: string;
  Name?: string;
  Route?: string;
  Create_By?: string;
  Creation_Date?: string;
  Modified_By?: string | null;
  Modification_Date?: string | Date | null;
};