export type LoginRequest = {
  Code: string
  password: string
}

export type LoginResponse = {
  Success: boolean
  SuccessMessage: string
  ErrorMessage: string
  InfoUser: string 
}

export interface UsersDTO {
  Id: number
  Code: string
  Name: string
  LastName: string
  Email: string
  PasswordHash: string
  Status_Id: number
  Theme: string
  Access: string

  Create_By: string
  Roles: string
  Creation_Date: string | Date

  Modified_By: string
  Modification_Date: string | Date | null
  DynamicColumns?: Record<string, string>
  [key: string]: any
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
  Code: string;
  Name: string;
  Description: string;
  Route: string;
  Icon: string;
  ParentMenu_Id: number;
  MenuOrder: number;
  Status_Name: string;
  User_Code: string;
  Create_By: string;
  Creation_Date: string;
  Modified_By: string | null;
  Modification_Date: string | Date | null;
};

export type AccessDTO = {
  Id: number;
  KeyVar?: string;
  Name?: string;
  Description?: string;
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