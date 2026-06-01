import { httpClient } from '../../core/httpClient'
import { ExecutionResponse } from '../response.type'
import { UsersDTO, LoginResponse, LoginRequest, MenuDTO, AccessDTO } from './security.types'

const schema = 'Security'
export const securityService = {
  login: (data: LoginRequest) => httpClient.post<LoginResponse, LoginRequest>(`${schema}/loginUser`,data),
  getUsers: () => httpClient.get<ExecutionResponse<UsersDTO[]>>(`${schema}/Users`),
  getMenuByUser: (userCode: string) => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menu?user_Code=${userCode}`),
  getMenus: () => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menus`),
  getAccess: () => httpClient.get<ExecutionResponse<AccessDTO[]>>(`${schema}/Access`),
  getMenu: (userCode: string) => httpClient.get<ExecutionResponse<MenuDTO[]>>(`${schema}/Menu?user_Code=${userCode}`),
}