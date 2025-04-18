import { Database, DBQuery } from "../../database/db-query";
import { GetRoute, UserInfo } from "../route";


class AllUsernamesQuery extends DBQuery<string[]> {

  // make a SQL query that gets the username, trophies, xp, and type of relationship for each friend
  public override readonly query = `SELECT username FROM users`;

  public override readonly warningMs = null;

  constructor() {
    super([]);
  }

  public override parseResult(resultRows: any[]): string[] {
    return resultRows.map((row) => row.username);
  }
}


/**
 * Route for getting the info for all friends and incoming/outgoing friend requests for a user
 */
export class GetAllUsernamesRoute extends GetRoute<string[]> {
  route = "/api/v2/all-usernames";

  override async get(userInfo: UserInfo | undefined): Promise<string[]> {
      
    const allUsernames = await Database.query(AllUsernamesQuery);
    return allUsernames;
  }
}