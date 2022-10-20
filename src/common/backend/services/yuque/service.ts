import { IBasicRequestService } from '@/service/common/request';
import { Container } from 'typedi';
import { RequestHelper } from '@/service/request/common/request';
import { DocumentService } from './../../index';
import { generateUuid } from '@web-clipper/shared/lib/uuid';
import * as qs from 'qs';
import md5 from '@web-clipper/shared/lib/md5';
import {
  YuqueBackendServiceConfig,
  YuqueUserInfoResponse,
  RepositoryType,
  YuqueRepositoryResponse,
  YuqueGroupResponse,
  YuqueCreateDocumentResponse,
  YuqueRepository,
  YuqueCompleteStatus,
  YuqueCreateDocumentRequest,
  YuqueToc,
} from './interface';

const HOST = 'https://www.yuque.com';
const BASE_URL = `${HOST}/api/v2/`;

export default class YuqueDocumentService implements DocumentService {
  private request: RequestHelper;
  private userInfo?: YuqueUserInfoResponse;
  private config: YuqueBackendServiceConfig;
  private repositories: YuqueRepository[];
  private requestFull: RequestHelper;
  // eslint-disable-next-line @typescript-eslint/member-ordering
  public tocs: YuqueToc[] | undefined;

  constructor({ accessToken, repositoryType = RepositoryType.all }: YuqueBackendServiceConfig) {
    this.config = { accessToken, repositoryType };
    this.request = new RequestHelper({
      baseURL: BASE_URL,
      headers: {
        'X-Auth-Token': accessToken,
      },
      request: Container.get(IBasicRequestService),
      interceptors: {
        response: e => (e as any).data,
      },
    });
    //全路径api
    this.requestFull = new RequestHelper({
      headers: {
        'X-Auth-Token': accessToken,
      },
      request: Container.get(IBasicRequestService),
      interceptors: {
        response: e => (e as any).data,
      },
    });
    this.repositories = [];
  }

  getId = () => md5(this.config.accessToken);

  getUserInfo = async () => {
    if (!this.userInfo) {
      this.userInfo = await this.getYuqueUserInfo();
    }
    const { avatar_url: avatar, name, login, description } = this.userInfo;
    const homePage = `${HOST}/${login}`;
    return {
      avatar,
      name,
      homePage,
      description,
      login,
    };
  };

  getRepositories = async () => {
    let response: YuqueRepository[] = [];
    if (this.config.repositoryType !== RepositoryType.group) {
      if (!this.userInfo) {
        this.userInfo = await this.getYuqueUserInfo();
      }
      const repos = await this.getAllRepositories(false, this.userInfo.id, this.userInfo.name);
      response = response.concat(repos);
    }
    if (this.config.repositoryType !== RepositoryType.self) {
      const groups = await this.getUserGroups();
      for (const group of groups) {
        const repos = await this.getAllRepositories(true, group.id, group.name);
        response = response.concat(repos);
      }
    }
    this.repositories = response;
    if (!this.tocs) {
      this.tocs = [];
      // eslint-disable-next-line guard-for-in
      for (let x in response) {
        let item = response[x];
        this.tocs.push(await this.getYuqueTocInfo(item.id, item.name));
      }
    }

    return response.map(({ namespace, ...rest }) => ({ ...rest }));
  };

  createDocument = async (info: YuqueCreateDocumentRequest): Promise<YuqueCompleteStatus> => {
    if (!this.userInfo) {
      this.userInfo = await this.getYuqueUserInfo();
    }
    const { content: body, title, repositoryId, path } = info;
    let [parentUid] = (path ? path : '|').split('|');
    const repository = this.repositories.find(o => o.id === repositoryId);
    if (!repository) {
      throw new Error('illegal repositoryId');
    }
    const request = {
      title,
      slug: info.slug || generateUuid(),
      body,
      private: true,
    };
    const response = await this.request.post<YuqueCreateDocumentResponse>(
      `repos/${repositoryId}/docs`,
      {
        data: request,
      }
    );
    const data = response;
    //移动文档
    await this.moveDoc(repositoryId, parentUid, [data.id]);

    return {
      href: `${HOST}/${repository.namespace}/${data.slug}`,
      repositoryId,
      documentId: data.id.toString(),
      accessToken: this.config.accessToken,
    };
  };

  getYuqueTocInfo = async (bookId: string, rootPath: string) => {
    const response = await this.requestFull.get(`${HOST}/api/books/${bookId}/toc`);
    // @ts-ignore
    let maps: { [k: string]: YuqueToc } = {};
    let depth: { [k: string]: string[] } = {};
    maps[bookId] = {
      title: rootPath,
      value: `|${bookId}`,
      children: [],
    };
    // @ts-ignore
    // eslint-disable-next-line guard-for-in
    for (let index in response.toc) {
      // @ts-ignore
      let toc = response.toc[index];
      if (toc.type !== 'TITLE') {
        continue;
      }

      let uuid: string = `${toc.uuid}`;
      let parentId: string = toc.parent_uuid ? toc.parent_uuid : bookId;
      maps[uuid] = {
        value: `${uuid}|${bookId}`,
        title: toc.title,
        children: [],
      };

      if (typeof depth[parentId] === 'undefined') {
        depth[parentId] = [uuid];
      } else {
        depth[parentId].push(uuid);
      }
    }
    //无限极分类代码
    let arr = [bookId];
    while (arr.length > 0) {
      let parentId: string = String(arr.shift());
      let parent = maps[parentId];
      let childs = depth[parentId];
      // eslint-disable-next-line no-undefined
      if (parent === undefined || childs === undefined) {
        continue;
      }
      for (let i = 0; i < childs.length; i++) {
        let toc = maps[childs[i]];
        let uuid = String(toc.title.split('|')[0]);
        // toc['title'] = `${parent['title']}/${toc['title']}`
        maps[parentId].children.push(toc);
        if (typeof depth[uuid] !== 'undefined') {
          arr.push(uuid);
        }
      }
    }

    return maps[bookId];
  };

  private moveDoc = async (bookId: String, targetId: String, uuids: Number[]) => {
    console.log(bookId, targetId, uuids);
    const query = {
      action: 'appendByDocs',
      doc_ids: uuids,
      target_uuid: targetId,
    };
    let url = `repos/${bookId}/toc`;

    return this.request.put(url, { data: query });
  };
  private getUserGroups = async () => {
    if (!this.userInfo) {
      this.userInfo = await this.getYuqueUserInfo();
    }
    return this.request.get<YuqueGroupResponse[]>(`users/${this.userInfo.login}/groups`);
  };

  private getYuqueUserInfo = async () => {
    return this.request.get<YuqueUserInfoResponse>('user');
  };

  private getAllRepositories = async (isGroup: boolean, groupId: number, groupName: string) => {
    let offset = 0;
    let result = await this.getYuqueRepositories(offset, isGroup, String(groupId));
    while (result.length - offset === 20) {
      offset = offset + 20;
      result = result.concat(await this.getYuqueRepositories(offset, isGroup, String(groupId)));
    }
    return result.map(
      ({ id, name, namespace }): YuqueRepository => ({
        id: String(id),
        name,
        groupId: String(groupId),
        groupName: groupName,
        namespace,
      })
    );
  };

  private getYuqueRepositories = async (offset: number, isGroup: boolean, slug: string) => {
    const query = {
      offset: offset,
    };
    try {
      const response = await this.request.get<YuqueRepositoryResponse[]>(
        `${isGroup ? 'groups' : 'users'}/${slug}/repos?${qs.stringify(query)}`
      );
      return response;
    } catch (_error) {
      return [];
    }
  };
}
