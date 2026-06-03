import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { UsersDTO, LoginResponse, LoginRequest, MenuDTO, AccessDTO, RolesDTO, UsersSettingsDTO, IAccessControl } from './security.types'

const schema = 'Security'
export const securityService = {
  login: (data: LoginRequest) => httpClient.post<LoginResponse, LoginRequest>(`${schema}/loginUser`,data),
  getUsers: () => httpClient.get<ExecutionResponse<UsersDTO[]>>(`${schema}/Users`),
  saveUsersSettings: (data: UsersSettingsDTO[]) => httpClient.post<ExecutionResponse<UsersSettingsDTO[]>>(`${schema}/UserSettings`, data),
  getMenuByUser: (userCode: string) => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menu?user_Code=${userCode}`),

  getMenus: () => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`),
  saveMenu: (data: MenuDTO[]) => httpClient.post<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`, data),
  changeStatusMenu: (data: MenuDTO[]) => httpClient.put<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`, data),

  getAccess: () => httpClient.get<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`),
  saveAccess: (data: AccessDTO[]) => httpClient.post<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`, data),
  changeStatusAccess: (data: AccessDTO[]) => httpClient.put<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`, data),
  
  getAccessById: (Id: number) => httpClient.get<ExecutionResponse<AccessDTO[]>>(`${schema}/AccessById?Id=${Id}`),

  getAccessControl: (Type_Id: number, Access_Id: number) => httpClient.get<ExecutionResponse<IAccessControl[]>>(`${schema}/AccessControl?Type_Id=${Type_Id}&Access_Id=${Access_Id}`),
  saveAccessControl: (data: IAccessControl[]) => httpClient.post<ExecutionResponse<IAccessControl[]>>(`${schema}/AccessControl`, data),

  getRoles: () => httpClient.get<ExecutionResponse<RolesDTO[]>>(`${schema}/Roles`),
  saveRoles: (data: RolesDTO[]) => httpClient.post<ExecutionResponse<RolesDTO[]>>(`${schema}/Roles`, data),
  changeStatusRoles: (data: RolesDTO[]) => httpClient.put<ExecutionResponse<RolesDTO[]>>(`${schema}/Roles`, data),
}