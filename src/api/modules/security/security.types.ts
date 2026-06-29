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

  Create_By?: string
  Roles?: RoleDTO[]
  Companies?: string
  DefaultCompany?: IDefaultCompany[] | null
  DefaultCompany_Id?: number | null
  Creation_Date?: string | Date
  ValidateAD?: boolean | null
  Gira:string,
  Modified_By?: string
  Modification_Date?: string | Date | null
  DynamicColumns?: Record<string, string>
  [key: string]: any
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