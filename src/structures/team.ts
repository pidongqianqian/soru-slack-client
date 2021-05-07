/*
Copyright 2020 soru-slack-client
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Client } from "./client";
import {IconBase, ICreatorValue, IIconData} from "./base";
import { IChannelData, Channel } from "./channel";
import { IUserData, User } from "./user";
import { Bot } from "./bot";
import {WebAPICallResult} from "@slack/web-api";

export interface ITeamData {
	id: string;
	fakeId?: string;
	name?: string;
	domain?: string;
	icon?: IIconData;
}

export class Team extends IconBase {
	public channels: Map<string, Channel> = new Map();
	public users: Map<string, User> = new Map();
	public bots: Map<string, Bot> = new Map();
	public id: string;
	public name: string;
	public domain: string;
	public email: string | null = null;
	public emailDomain: string | null = null;
	public icon: IIconData | null = null;
	public enterpriseId: string | null = null;
	public enterpriseName: string | null = null;
	public partial = true;
	public fakeId: string | null = null;
	constructor(client: Client, data: ITeamData) {
		super(client);
		this._patch(data);
	}

	public _patch(data: ITeamData) {
		this.id = data.id;
		if (data.hasOwnProperty("name")) {
			this.name = data.name!;
		}
		if (data.hasOwnProperty("domain")) {
			this.domain = data.domain!;
		}
		if (data.hasOwnProperty("icon")) {
			this.icon = data.icon || null;
		}
		if (data.hasOwnProperty("fakeId")) {
			this.fakeId = data.fakeId!;
		}
		if (this.client.tokens.has(this.id)) {
			if (this.fakeId && !this.partial) {
				this.partial = true;
			}
			this.fakeId = null;
		}
	}

	public async joinAllChannels() {
		if (this.partial) {
			await this.load();
		}
		for (const [, channel] of this.channels) {
			await channel.join();
		}
	}

	public async load() {
		// first load the team itself
		{
			const ret = await this.client.web(this.fakeId || this.id).team.info({
				team: this.id,
			});
			if (!ret || !ret.ok || !ret.team) {
				throw new Error("Bad response");
			}
			this._patch(ret.team as ITeamData);
		}
		if (this.fakeId) {
			this.partial = false;
			return;
		}
		// next load in the channels
		{
			let cursor: string | undefined;
			do {
				const ret = await this.client.web(this.id).conversations.list({
					types: "public_channel,private_channel,mpim,im",
					limit: 1000,
					cursor,
					exclude_archived: true
				});
				if (!ret || !ret.ok || !ret.channels) {
					throw new Error("Bad response");
				}
				for (const channelData of ret.channels as IChannelData[]) {
					channelData.team_id = this.id;
					this.client.addChannel(channelData);
				}
				cursor = ret.response_metadata && ret.response_metadata.next_cursor;
			} while (cursor);
		}
		// next load in the users
		{
			let cursor: string | undefined;
			do {
				const ret = await this.client.web(this.id).users.list({
					limit: 1000,
					cursor,
				});
				if (!ret || !ret.ok || !ret.members) {
					throw new Error("Bad response");
				}
				for (const userData of ret.members as IUserData[]) {
					this.client.addUser(userData);
				}
				cursor = ret.response_metadata && ret.response_metadata.next_cursor;
			} while (cursor);
		}
		this.partial = false;
	}

	public isBotToken(): boolean {
		const token = this.client.tokens.get(this.id) || "";
		return token.startsWith("xoxb");
	}


	public async create(name: string, isPrivate:boolean): Promise<string> {
		const result =  await this.client.web(this.id).conversations.create({
			name: name,
			is_private: isPrivate,
			team_id: this.id
		});
		if (result.channel) {
			const channelData: IChannelData = {
				id: (<IChannelData>result.channel).id,
				name: name,
				is_channel: (<IChannelData>result.channel).is_channel,
				is_group: (<IChannelData>result.channel).is_group,
				is_mpim: (<IChannelData>result.channel).is_mpim,
				is_im: (<IChannelData>result.channel).is_im,
				is_private: (<IChannelData>result.channel).is_private,
				team_id: this.id,
			}
			this.client.addChannel(<IChannelData>channelData);
			return (<IChannelData>result.channel).id;
		} else {
			return '';
		}
		
	}

	/**
	 * Invites users to a channel.
	 * @param channel {string} Required. The ID of the public or private channel to invite user(s) to.
	 * Example C1234567890
	 * @param users {string} Required. A comma separated list of user IDs. Up to 1000 users may be listed.
	 * Example W1234567890,U2345678901,U3456789012
	 */
	public async invite(channel: string, users:string): Promise<any> {
		const result = await this.client.web(this.id).conversations.invite({
			channel: channel,
			users: users,
		});
		return result.ok;
	}

	/**
	 * kick user from a channel.
	 * @param channel {string} Required. ID of conversation to remove user from.
	 * Example C1234567890
	 * @param user {string} Required. User ID to be removed..
	 * Example W1234567890
	 */
	public async kick(channel: string, user: string): Promise<any> {
		const result = await this.client.web(this.id).conversations.kick({
			channel: channel,
			user: user,
		});
		return result.ok;
	}

	/**
	 * leave a conversation.
	 * @param channel {string} Required. ID of conversation to leave.
	 * Example C1234567890
	 */
	public async leave(channel: string): Promise<any> {
		return await this.client.web(this.id).conversations.leave({
			channel: channel,
		});
	}

	/**
	 * archive a conversation.
	 * @param channel {string} Required. ID of conversation to archive.
	 * Example C1234567890
	 */
	public async archive(channel: string): Promise<any> {
		return await this.client.web(this.id).conversations.archive({
			channel: channel,
		});
	}
}
