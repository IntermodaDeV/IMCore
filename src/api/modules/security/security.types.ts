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
  Status_Id: string
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
};

export type AccessDTO = {
  Id: number;
  KeyVar: string;
  Name: string;
  Description: string;
  Status_Id: number;
  Create_By: string;
  Creation_Date: string;
  Modified_By: string | null;
  Modification_Date: string | Date | null;
  Status_Name: string;
};