import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { UsersDTO, LoginResponse, LoginRequest, MenuDTO, AccessDTO, RolesDTO, UsersSettingsDTO, IAccessControl, ITypes, IMenuControl, IUserExternalCodes } from './security.types'

const schema = 'Security'
export const securityService = {
  login: (data: LoginRequest) => httpClient.post<LoginResponse, LoginRequest>(`${schema}/loginUser`,data),
  getUsers: () => httpClient.get<ExecutionResponse<UsersDTO[]>>(`${schema}/Users`),
  saveUsers: (data: UsersDTO[]) => httpClient.post<ExecutionResponse<UsersDTO[]>>(`${schema}/Users`, data),
  saveUsersSettings: (data: UsersSettingsDTO[]) => httpClient.post<ExecutionResponse<UsersSettingsDTO[]>>(`${schema}/UserSettings`, data),
  changePassword: (data: any[]) => httpClient.post<ExecutionResponse<any[]>>(`${schema}/UsersPassword`, data),
  getUserById: (Id: number) => httpClient.get<ExecutionResponse<UsersDTO[]>>(`${schema}/UserById?Id=${Id}`),
  saveUserExternalCodes: (data: IUserExternalCodes[]) => httpClient.post<ExecutionResponse<IUserExternalCodes[]>>(`${schema}/UserExternalCodes`, data),
  
  getMenus: () => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`),
  saveMenu: (data: MenuDTO[]) => httpClient.post<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`, data),
  changeStatusMenu: (data: MenuDTO[]) => httpClient.put<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`, data),
  getMenuById: (Id: number) => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/MenuById?Id=${Id}`),
  getMenuByUser: (userCode: string) => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menu?user_Code=${userCode}`),

  getMenuControl: (Type_Id: number, Menu_Id: number) => httpClient.get<ExecutionResponse<IMenuControl[]>>(`${schema}/MenuControl?Type_Id=${Type_Id}&Menu_Id=${Menu_Id}`),
  saveMenuControl: (data: IMenuControl[]) => httpClient.post<ExecutionResponse<IMenuControl[]>>(`${schema}/MenuControl`, data),
  getMenuControlByRol: (Rol_Id: number) => httpClient.get<ExecutionResponse<IMenuControl[]>>(`${schema}/MenuControlByRol?Rol_Id=${Rol_Id}`),
  getMenuControlByUser: (User_Code: string) => httpClient.get<ExecutionResponse<IMenuControl[]>>(`${schema}/MenuControlByUser?User_Code=${User_Code}`),

  getAccess: () => httpClient.get<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`),
  saveAccess: (data: AccessDTO[]) => httpClient.post<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`, data),
  changeStatusAccess: (data: AccessDTO[]) => httpClient.put<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`, data),
  getAccessById: (Id: number) => httpClient.get<ExecutionResponse<AccessDTO[]>>(`${schema}/AccessById?Id=${Id}`),

  getAccessControl: (Type_Id: number, Access_Id: number) => httpClient.get<ExecutionResponse<IAccessControl[]>>(`${schema}/AccessControl?Type_Id=${Type_Id}&Access_Id=${Access_Id}`),
  saveAccessControl: (data: IAccessControl[]) => httpClient.post<ExecutionResponse<IAccessControl[]>>(`${schema}/AccessControl`, data),
  getAccessControlByRol: (Rol_Id: number) => httpClient.get<ExecutionResponse<IAccessControl[]>>(`${schema}/AccessControlByRol?Rol_Id=${Rol_Id}`),
  getAccessControlByUser: (User_Code: string) => httpClient.get<ExecutionResponse<IAccessControl[]>>(`${schema}/AccessControlByUser?User_Code=${User_Code}`),


  getRoles: () => httpClient.get<ExecutionResponse<RolesDTO[]>>(`${schema}/Roles`),
  saveRoles: (data: RolesDTO[]) => httpClient.post<ExecutionResponse<RolesDTO[]>>(`${schema}/Roles`, data),
  changeStatusRoles: (data: RolesDTO[]) => httpClient.put<ExecutionResponse<RolesDTO[]>>(`${schema}/Roles`, data),
  getRolById: (Id: number) => httpClient.get<ExecutionResponse<RolesDTO[]>>(`${schema}/RolById?Id=${Id}`),

  getTypesByCategory: (Category: string) => httpClient.get<ExecutionResponse<ITypes[]>>(`${schema}/TypesByCategory?Category=${Category}`),
}