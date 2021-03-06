import { Filter } from '@sheetbase/sheets';
import { User as UserData, UserProfile, UserProviderId } from '@sheetbase/models';

import { Options, DatabaseDriver } from './types';
import { TokenService } from './token';
import { OauthService } from './oauth';
import { User } from './user';
import { uniqueId } from './utils';

export class AccountService {

    private Database: DatabaseDriver;
    private Token: TokenService;
    private Oauth: OauthService;

    constructor(options: Options) {
        this.Database = options.databaseDriver;
        this.Token = new TokenService(options);
        this.Oauth = new OauthService();
    }

    user(userData: UserData) {
        return new User(userData, this.Database, this.Token);
    }

    getUser(finder: string | Filter) {
        const userData = this.Database.getUser(finder);
        return !!userData ? this.user(userData) : null;
    }

    isUser(finder: string | Filter) {
        return !! this.getUser(finder);
    }

    getUserByEmailAndPassword(email: string, password: string) {
        const user = this.getUser({ email });
        if (!user) {
            const newUser: UserData = {
                uid: uniqueId(28, '1'),
                providerId: 'password',
                createdAt: new Date().toISOString(),
                isNewUser: true,
            };
            return this.user(newUser)
                .setEmail(email)
                .setPassword(password)
                .setRefreshToken();
        } else if (!!user && user.comparePassword(password)) {
            return user;
        } else {
            return null;
        }
    }

    getUserByCustomToken(customToken: string) {
        const payload = this.Token.decodeIdToken(customToken);
        if (!!payload) {
            const { uid, developerClaims: claims } = payload;
            const user = this.getUser(uid);
            if (!user) {
                const newUser: UserData = {
                    uid,
                    providerId: 'custom',
                    createdAt: new Date().toISOString(),
                    isNewUser: true,
                };
                if (!!claims) { newUser.claims = claims; }
                return this.user(newUser)
                    .setRefreshToken();
            } else {
                return user;
            }
        } else {
            return null;
        }
    }

    getUserAnonymously() {
        const newUser: UserData = {
            uid: uniqueId(28, '1'),
            providerId: 'anonymous',
            createdAt: new Date().toISOString(),
            isAnonymous: true,
            isNewUser: true,
        };
        return this.user(newUser)
            .setRefreshToken();
    }

    getUserByIdToken(idToken: string) {
        const payload = this.Token.decodeIdToken(idToken);
        if (!!payload) {
            const { uid } = payload;
            const user = this.getUser(uid);
            if (!!user) {
                return user;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    getUserByOobCode(oobCode: string) {
        const user = this.getUser({ oobCode });
        if (!!user) {
            const { oobTimestamp } = user.getData();
            const beenMinutes = Math.round(((new Date()).getTime() - oobTimestamp) / 60000);
            if (!!oobTimestamp && beenMinutes < 60) {
                return user;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    getUserByRefreshToken(refreshToken: string) {
        return this.getUser({ refreshToken });
    }

    getUserByOauthProvider(providerId: UserProviderId, accessToken: string) {
        const userInfo: any = this.Oauth.getUserInfo(providerId, accessToken);
        if (!!userInfo) {
            const { id, email } = userInfo;
            if (!!email) { // google, facebook
                const user = this.getUser({ email });
                if (!user) {
                    // extract profile from userinfo
                    const userProfile = this.Oauth.processUserInfo(providerId, userInfo);
                    // new user
                    const newUser: UserData = {
                        ... userProfile,
                        uid: uniqueId(28, '1'),
                        providerId,
                        createdAt: new Date().toISOString(),
                        emailVerified: true,
                        isNewUser: true,
                        additionalData: { id },
                    };
                    return this.user(newUser)
                        .setEmail(email)
                        .setRefreshToken();
                } else {
                    if (user.getProvider().providerId === providerId) {
                        return user;
                    } else {
                        throw new Error('auth/mismatch-provider');
                    }
                }
            }
        } else {
            return null;
        }
    }

    getPublicUsers(uids: string | string[]): {[uid: string]: UserProfile} {
        // turn string into string[]
        if (typeof uids === 'string') {
            uids = [ uids ];
        }
        // get profiles
        const profiles = {};
        for (let i = 0; i < uids.length; i++) {
            const uid = uids[i];
            profiles[uid] = this.getUser(uid).getPublicProfile();
        }
        return profiles;
    }

    isValidPassword(password: string) {
        return password.length >= 7;
    }

}